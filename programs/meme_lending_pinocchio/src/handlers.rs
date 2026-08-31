use pinocchio::{
    cpi::Signer,
    error::ProgramError,
    sysvars::{clock::Clock, Sysvar},
    AccountView, Address, ProgramResult,
};

use crate::{
    codec::Decoder,
    cpi::create_program_account,
    pda::{
        self, ASSOCIATED_TOKEN_PROGRAM, BORROWER_POSITION_SEED, GLOBAL_CONFIG_SEED,
        LENDER_POSITION_SEED, MARKET_AUTHORITY_SEED, MARKET_SEED, ORACLE_CONFIG_SEED,
        ORACLE_OBSERVATION_SEED, RESERVE_SEED, RESERVE_VAULT_SEED,
    },
    state::{
        AccountHeader, AccountKind, BorrowerPosition, FirstLossReserve, GlobalConfig,
        LenderPosition, Market, OracleConfiguration, OracleObservation, GLOBAL_FLAG_PAUSED,
        MARKET_FLAG_BORROWING_PAUSED, MARKET_FLAG_REWARDS_ENABLED, STATE_VERSION,
    },
    validation, INITIAL_AUTHORITY,
};

fn payload(data: &[u8]) -> Result<Decoder<'_>, ProgramError> {
    data.get(1..)
        .map(Decoder::new)
        .ok_or(ProgramError::InvalidInstructionData)
}

fn verify_market(
    program_id: &Address,
    market_account: &AccountView,
    market: &Market,
    market_authority: &AccountView,
) -> ProgramResult {
    validation::owner(market_account, program_id)?;
    pda::verify(
        market_account.address(),
        &[MARKET_SEED, &market.config_hash],
        market.header.bump,
        program_id,
    )?;
    pda::verify(
        market_authority.address(),
        &[MARKET_AUTHORITY_SEED, market_account.address().as_ref()],
        market.authority_bump,
        program_id,
    )
}

fn verify_ata_vault(
    vault: &AccountView,
    market_authority: &AccountView,
    token_program: &AccountView,
    mint: &AccountView,
    bump: u8,
) -> ProgramResult {
    pda::verify(
        vault.address(),
        &[
            market_authority.address().as_ref(),
            token_program.address().as_ref(),
            mint.address().as_ref(),
        ],
        bump,
        &ASSOCIATED_TOKEN_PROGRAM,
    )?;
    let state = validation::token_account(vault, token_program)?;
    if state.mint != *mint.address().as_array()
        || state.authority != *market_authority.address().as_array()
    {
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(())
}

fn verify_reserve_vault(
    program_id: &Address,
    vault: &AccountView,
    market_account: &AccountView,
    market: &Market,
    market_authority: &AccountView,
    token_program: &AccountView,
) -> ProgramResult {
    pda::verify(
        vault.address(),
        &[RESERVE_VAULT_SEED, market_account.address().as_ref()],
        market.vault_bumps[2],
        program_id,
    )?;
    let state = validation::token_account(vault, token_program)?;
    if state.mint != market.loan_mint || state.authority != *market_authority.address().as_array() {
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(())
}

fn decode_global(
    program_id: &Address,
    account: &AccountView,
) -> Result<GlobalConfig, ProgramError> {
    validation::owner(account, program_id)?;
    let config = GlobalConfig::decode(&account.try_borrow()?)?;
    pda::verify(
        account.address(),
        &[GLOBAL_CONFIG_SEED],
        config.header.bump,
        program_id,
    )?;
    Ok(config)
}

fn decode_oracle(
    program_id: &Address,
    market_account: &AccountView,
    config_account: &AccountView,
    observation_account: &AccountView,
) -> Result<(OracleConfiguration, OracleObservation), ProgramError> {
    validation::owner(config_account, program_id)?;
    validation::owner(observation_account, program_id)?;
    let config = OracleConfiguration::decode(&config_account.try_borrow()?)?;
    let observation = OracleObservation::decode(&observation_account.try_borrow()?)?;
    pda::verify(
        config_account.address(),
        &[ORACLE_CONFIG_SEED, market_account.address().as_ref()],
        config.header.bump,
        program_id,
    )?;
    pda::verify(
        observation_account.address(),
        &[ORACLE_OBSERVATION_SEED, market_account.address().as_ref()],
        observation.header.bump,
        program_id,
    )?;
    if config.market != *market_account.address().as_array() {
        return Err(ProgramError::InvalidAccountData);
    }
    Ok((config, observation))
}

/// Accounts: authority/payer, global config PDA.
/// Data: tag, approved loan mint, fee recipient, max oracle age, bump.
pub fn initialize_protocol(
    program_id: &Address,
    accounts: &mut [AccountView],
    data: &[u8],
) -> ProgramResult {
    let [authority, global] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };
    validation::signer(authority)?;
    validation::writable(authority)?;
    validation::writable(global)?;
    if authority.address() != &INITIAL_AUTHORITY || !global.is_data_empty() {
        return Err(ProgramError::InvalidArgument);
    }
    let mut decoder = payload(data)?;
    let approved_loan_mint = *decoder.take()?;
    let protocol_fee_recipient = *decoder.take()?;
    let max_oracle_age_seconds = decoder.u32()?;
    let bump = decoder.u8()?;
    decoder.finish()?;
    if max_oracle_age_seconds == 0 {
        return Err(ProgramError::InvalidArgument);
    }
    let seeds = [GLOBAL_CONFIG_SEED];
    pda::verify_canonical(global.address(), &seeds, bump, program_id)?;
    let bump_seed = [bump];
    let signer_seeds = pinocchio::instruction::seeds!(GLOBAL_CONFIG_SEED, &bump_seed);
    let signer = Signer::from(&signer_seeds);
    create_program_account(authority, global, program_id, GlobalConfig::LEN, &signer)?;
    let config = GlobalConfig {
        header: AccountHeader {
            version: STATE_VERSION,
            kind: AccountKind::GlobalConfig,
            bump,
        },
        authority: *authority.address().as_array(),
        pending_authority: [0; 32],
        approved_loan_mint,
        protocol_fee_recipient,
        market_count: 0,
        max_oracle_age_seconds,
        flags: 0,
    };
    config.encode(&mut global.try_borrow_mut()?)
}

/// Accounts: authority, global config PDA. Data: tag, paused.
pub fn set_protocol_pause(
    program_id: &Address,
    accounts: &mut [AccountView],
    data: &[u8],
) -> ProgramResult {
    let [authority, global] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };
    validation::signer(authority)?;
    validation::writable(global)?;
    validation::owner(global, program_id)?;
    let mut config = GlobalConfig::decode(&global.try_borrow()?)?;
    pda::verify(
        global.address(),
        &[GLOBAL_CONFIG_SEED],
        config.header.bump,
        program_id,
    )?;
    if authority.address().as_array() != &config.authority {
        return Err(ProgramError::InvalidArgument);
    }
    let mut decoder = payload(data)?;
    let paused = decoder.u8()?;
    decoder.finish()?;
    if paused > 1 {
        return Err(ProgramError::InvalidInstructionData);
    }
    config.flags = if paused == 1 { GLOBAL_FLAG_PAUSED } else { 0 };
    config.encode(&mut global.try_borrow_mut()?)
}

/// Accounts: authority, global config, market. Data: tag, paused.
pub fn pause_market(
    program_id: &Address,
    accounts: &mut [AccountView],
    data: &[u8],
) -> ProgramResult {
    let [authority, global, market_account] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };
    validation::signer(authority)?;
    validation::owner(global, program_id)?;
    validation::owner(market_account, program_id)?;
    validation::writable(market_account)?;
    let config = GlobalConfig::decode(&global.try_borrow()?)?;
    let mut market = Market::decode(&market_account.try_borrow()?)?;
    pda::verify(
        global.address(),
        &[GLOBAL_CONFIG_SEED],
        config.header.bump,
        program_id,
    )?;
    pda::verify(
        market_account.address(),
        &[MARKET_SEED, &market.config_hash],
        market.header.bump,
        program_id,
    )?;
    let authority_bytes = authority.address().as_array();
    if authority_bytes != &config.authority && authority_bytes != &market.creator {
        return Err(ProgramError::InvalidArgument);
    }
    let mut decoder = payload(data)?;
    let paused = decoder.u8()?;
    decoder.finish()?;
    if paused > 1 {
        return Err(ProgramError::InvalidInstructionData);
    }
    market.flags = if paused == 1 {
        market.flags | MARKET_FLAG_BORROWING_PAUSED
    } else {
        market.flags & !MARKET_FLAG_BORROWING_PAUSED
    };
    market.encode(&mut market_account.try_borrow_mut()?)
}

/// Accounts: market, liquidity vault, loan mint, market authority, token program.
pub fn accrue_interest(
    program_id: &Address,
    accounts: &mut [AccountView],
    data: &[u8],
) -> ProgramResult {
    let [market_account, liquidity_vault, loan_mint, market_authority, token_program] = accounts
    else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };
    payload(data)?.finish()?;
    validation::writable(market_account)?;
    validation::owner(market_account, program_id)?;
    let mut market = Market::decode(&market_account.try_borrow()?)?;
    pda::verify(
        market_account.address(),
        &[MARKET_SEED, &market.config_hash],
        market.header.bump,
        program_id,
    )?;
    pda::verify(
        market_authority.address(),
        &[MARKET_AUTHORITY_SEED, market_account.address().as_ref()],
        market.authority_bump,
        program_id,
    )?;
    if loan_mint.address().as_array() != &market.loan_mint
        || !loan_mint.owned_by(token_program.address())
    {
        return Err(ProgramError::InvalidAccountData);
    }
    pda::verify(
        liquidity_vault.address(),
        &[
            market_authority.address().as_ref(),
            token_program.address().as_ref(),
            loan_mint.address().as_ref(),
        ],
        market.vault_bumps[0],
        &ASSOCIATED_TOKEN_PROGRAM,
    )?;
    let vault = validation::token_account(liquidity_vault, token_program)?;
    if vault.mint != market.loan_mint || vault.authority != *market_authority.address().as_array() {
        return Err(ProgramError::InvalidAccountData);
    }
    crate::engine::accrue_market(&mut market, vault.amount, Clock::get()?.unix_timestamp)?;
    market.encode(&mut market_account.try_borrow_mut()?)
}

/// Supply is unavailable while rewards are active until the rewards handler is
/// provided as an additional validated account.
pub fn supply_usdc(
    program_id: &Address,
    accounts: &mut [AccountView],
    data: &[u8],
) -> ProgramResult {
    validation::distinct_writable(accounts)?;
    let [lender, market_account, position_account, lender_tokens, liquidity_vault, loan_mint, market_authority, token_program] =
        accounts
    else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };
    validation::signer(lender)?;
    for account in [
        &*lender,
        &*market_account,
        &*position_account,
        &*lender_tokens,
        &*liquidity_vault,
    ] {
        validation::writable(account)?;
    }
    let mut decoder = payload(data)?;
    let amount = decoder.u64()?;
    let position_bump = decoder.u8()?;
    decoder.finish()?;
    if amount == 0 {
        return Err(ProgramError::InvalidArgument);
    }
    let mut market = Market::decode(&market_account.try_borrow()?)?;
    verify_market(program_id, market_account, &market, market_authority)?;
    if market.flags & MARKET_FLAG_REWARDS_ENABLED != 0
        || loan_mint.address().as_array() != &market.loan_mint
    {
        return Err(ProgramError::InvalidArgument);
    }
    verify_ata_vault(
        liquidity_vault,
        market_authority,
        token_program,
        loan_mint,
        market.vault_bumps[0],
    )?;
    let user_tokens = validation::token_account(lender_tokens, token_program)?;
    if user_tokens.mint != market.loan_mint || user_tokens.authority != *lender.address().as_array()
    {
        return Err(ProgramError::InvalidAccountData);
    }
    let decimals = validation::mint_decimals(loan_mint, token_program)?;
    let cash = validation::token_account(liquidity_vault, token_program)?.amount;
    crate::engine::accrue_market(&mut market, cash, Clock::get()?.unix_timestamp)?;
    let shares = crate::math::assets_to_shares(
        amount,
        crate::engine::net_market_assets(&market, cash)?,
        market.total_supply_shares,
    )?;
    let mut position = if position_account.is_data_empty() {
        let seeds = [
            LENDER_POSITION_SEED,
            market_account.address().as_ref(),
            lender.address().as_ref(),
        ];
        pda::verify_canonical(
            position_account.address(),
            &seeds,
            position_bump,
            program_id,
        )?;
        let bump_seed = [position_bump];
        let signer_seeds = pinocchio::instruction::seeds!(
            LENDER_POSITION_SEED,
            market_account.address().as_ref(),
            lender.address().as_ref(),
            &bump_seed
        );
        create_program_account(
            lender,
            position_account,
            program_id,
            LenderPosition::LEN,
            &Signer::from(&signer_seeds),
        )?;
        LenderPosition {
            header: AccountHeader {
                version: STATE_VERSION,
                kind: AccountKind::LenderPosition,
                bump: position_bump,
            },
            market: *market_account.address().as_array(),
            owner: *lender.address().as_array(),
            supply_shares: 0,
            reward_index_checkpoint: 0,
            reward_owed: 0,
        }
    } else {
        validation::owner(position_account, program_id)?;
        let position = LenderPosition::decode(&position_account.try_borrow()?)?;
        pda::verify(
            position_account.address(),
            &[
                LENDER_POSITION_SEED,
                market_account.address().as_ref(),
                lender.address().as_ref(),
            ],
            position.header.bump,
            program_id,
        )?;
        if position.market != *market_account.address().as_array()
            || position.owner != *lender.address().as_array()
        {
            return Err(ProgramError::InvalidAccountData);
        }
        position
    };
    crate::cpi::transfer_checked(
        token_program,
        lender_tokens,
        loan_mint,
        liquidity_vault,
        lender,
        amount,
        decimals,
        &[],
    )?;
    position.supply_shares = position
        .supply_shares
        .checked_add(shares)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    market.total_supply_shares = market
        .total_supply_shares
        .checked_add(shares)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    position.encode(&mut position_account.try_borrow_mut()?)?;
    market.encode(&mut market_account.try_borrow_mut()?)
}

/// Adding collateral intentionally has no oracle or pause dependency.
pub fn deposit_collateral(
    program_id: &Address,
    accounts: &mut [AccountView],
    data: &[u8],
) -> ProgramResult {
    validation::distinct_writable(accounts)?;
    let [borrower, market_account, position_account, borrower_tokens, collateral_vault, collateral_mint, market_authority, token_program] =
        accounts
    else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };
    validation::signer(borrower)?;
    for account in [
        &*borrower,
        &*position_account,
        &*borrower_tokens,
        &*collateral_vault,
    ] {
        validation::writable(account)?;
    }
    let mut decoder = payload(data)?;
    let amount = decoder.u64()?;
    let position_bump = decoder.u8()?;
    decoder.finish()?;
    if amount == 0 {
        return Err(ProgramError::InvalidArgument);
    }
    let market = Market::decode(&market_account.try_borrow()?)?;
    verify_market(program_id, market_account, &market, market_authority)?;
    if collateral_mint.address().as_array() != &market.collateral_mint {
        return Err(ProgramError::InvalidAccountData);
    }
    verify_ata_vault(
        collateral_vault,
        market_authority,
        token_program,
        collateral_mint,
        market.vault_bumps[1],
    )?;
    let user_tokens = validation::token_account(borrower_tokens, token_program)?;
    if user_tokens.mint != market.collateral_mint
        || user_tokens.authority != *borrower.address().as_array()
    {
        return Err(ProgramError::InvalidAccountData);
    }
    let decimals = validation::mint_decimals(collateral_mint, token_program)?;
    let mut position = if position_account.is_data_empty() {
        let seeds = [
            BORROWER_POSITION_SEED,
            market_account.address().as_ref(),
            borrower.address().as_ref(),
        ];
        pda::verify_canonical(
            position_account.address(),
            &seeds,
            position_bump,
            program_id,
        )?;
        let bump_seed = [position_bump];
        let signer_seeds = pinocchio::instruction::seeds!(
            BORROWER_POSITION_SEED,
            market_account.address().as_ref(),
            borrower.address().as_ref(),
            &bump_seed
        );
        create_program_account(
            borrower,
            position_account,
            program_id,
            BorrowerPosition::LEN,
            &Signer::from(&signer_seeds),
        )?;
        BorrowerPosition {
            header: AccountHeader {
                version: STATE_VERSION,
                kind: AccountKind::BorrowerPosition,
                bump: position_bump,
            },
            market: *market_account.address().as_array(),
            owner: *borrower.address().as_array(),
            collateral_amount: 0,
            borrow_shares: 0,
        }
    } else {
        validation::owner(position_account, program_id)?;
        let position = BorrowerPosition::decode(&position_account.try_borrow()?)?;
        pda::verify(
            position_account.address(),
            &[
                BORROWER_POSITION_SEED,
                market_account.address().as_ref(),
                borrower.address().as_ref(),
            ],
            position.header.bump,
            program_id,
        )?;
        if position.market != *market_account.address().as_array()
            || position.owner != *borrower.address().as_array()
        {
            return Err(ProgramError::InvalidAccountData);
        }
        position
    };
    crate::cpi::transfer_checked(
        token_program,
        borrower_tokens,
        collateral_mint,
        collateral_vault,
        borrower,
        amount,
        decimals,
        &[],
    )?;
    position.collateral_amount = position
        .collateral_amount
        .checked_add(amount)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    position.encode(&mut position_account.try_borrow_mut()?)
}

/// Repayment intentionally has no oracle account and remains available while paused.
pub fn repay_usdc(
    program_id: &Address,
    accounts: &mut [AccountView],
    data: &[u8],
) -> ProgramResult {
    validation::distinct_writable(accounts)?;
    let [payer, market_account, position_account, payer_tokens, liquidity_vault, loan_mint, market_authority, token_program] =
        accounts
    else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };
    validation::signer(payer)?;
    for account in [
        &*market_account,
        &*position_account,
        &*payer_tokens,
        &*liquidity_vault,
    ] {
        validation::writable(account)?;
    }
    let mut decoder = payload(data)?;
    let requested = decoder.u64()?;
    decoder.finish()?;
    let mut market = Market::decode(&market_account.try_borrow()?)?;
    verify_market(program_id, market_account, &market, market_authority)?;
    if loan_mint.address().as_array() != &market.loan_mint {
        return Err(ProgramError::InvalidAccountData);
    }
    verify_ata_vault(
        liquidity_vault,
        market_authority,
        token_program,
        loan_mint,
        market.vault_bumps[0],
    )?;
    validation::owner(position_account, program_id)?;
    let mut position = BorrowerPosition::decode(&position_account.try_borrow()?)?;
    let owner = Address::new_from_array(position.owner);
    pda::verify(
        position_account.address(),
        &[
            BORROWER_POSITION_SEED,
            market_account.address().as_ref(),
            owner.as_ref(),
        ],
        position.header.bump,
        program_id,
    )?;
    if position.market != *market_account.address().as_array() {
        return Err(ProgramError::InvalidAccountData);
    }
    let payer_state = validation::token_account(payer_tokens, token_program)?;
    if payer_state.mint != market.loan_mint || payer_state.authority != *payer.address().as_array()
    {
        return Err(ProgramError::InvalidAccountData);
    }
    let decimals = validation::mint_decimals(loan_mint, token_program)?;
    let cash = validation::token_account(liquidity_vault, token_program)?.amount;
    crate::engine::accrue_market(&mut market, cash, Clock::get()?.unix_timestamp)?;
    let debt = crate::math::shares_to_debt_ceil(position.borrow_shares, market.borrow_index)?;
    let amount = requested.min(debt);
    if amount == 0 {
        return Err(ProgramError::InvalidArgument);
    }
    let shares = if amount == debt {
        position.borrow_shares
    } else {
        crate::math::mul_div_floor(u128::from(amount), position.borrow_shares, u128::from(debt))?
    };
    if shares == 0 {
        return Err(ProgramError::InvalidArgument);
    }
    crate::cpi::transfer_checked(
        token_program,
        payer_tokens,
        loan_mint,
        liquidity_vault,
        payer,
        amount,
        decimals,
        &[],
    )?;
    position.borrow_shares = position
        .borrow_shares
        .checked_sub(shares)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    market.total_borrow_shares = market
        .total_borrow_shares
        .checked_sub(shares)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    market.total_debt = market
        .total_debt
        .checked_sub(u128::from(amount))
        .ok_or(ProgramError::ArithmeticOverflow)?;
    position.encode(&mut position_account.try_borrow_mut()?)?;
    market.encode(&mut market_account.try_borrow_mut()?)
}

pub fn withdraw_usdc(
    program_id: &Address,
    accounts: &mut [AccountView],
    data: &[u8],
) -> ProgramResult {
    validation::distinct_writable(accounts)?;
    let [lender, market_account, position_account, lender_tokens, liquidity_vault, loan_mint, market_authority, token_program] =
        accounts
    else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };
    validation::signer(lender)?;
    for account in [
        &*market_account,
        &*position_account,
        &*lender_tokens,
        &*liquidity_vault,
    ] {
        validation::writable(account)?;
    }
    let mut decoder = payload(data)?;
    let shares = decoder.u128()?;
    decoder.finish()?;
    let mut market = Market::decode(&market_account.try_borrow()?)?;
    verify_market(program_id, market_account, &market, market_authority)?;
    if market.flags & MARKET_FLAG_REWARDS_ENABLED != 0
        || loan_mint.address().as_array() != &market.loan_mint
    {
        return Err(ProgramError::InvalidArgument);
    }
    verify_ata_vault(
        liquidity_vault,
        market_authority,
        token_program,
        loan_mint,
        market.vault_bumps[0],
    )?;
    validation::owner(position_account, program_id)?;
    let mut position = LenderPosition::decode(&position_account.try_borrow()?)?;
    pda::verify(
        position_account.address(),
        &[
            LENDER_POSITION_SEED,
            market_account.address().as_ref(),
            lender.address().as_ref(),
        ],
        position.header.bump,
        program_id,
    )?;
    if position.owner != *lender.address().as_array()
        || position.market != *market_account.address().as_array()
        || position.supply_shares < shares
    {
        return Err(ProgramError::InvalidAccountData);
    }
    let user_tokens = validation::token_account(lender_tokens, token_program)?;
    if user_tokens.mint != market.loan_mint || user_tokens.authority != *lender.address().as_array()
    {
        return Err(ProgramError::InvalidAccountData);
    }
    let decimals = validation::mint_decimals(loan_mint, token_program)?;
    let cash = validation::token_account(liquidity_vault, token_program)?.amount;
    crate::engine::accrue_market(&mut market, cash, Clock::get()?.unix_timestamp)?;
    let assets = crate::math::shares_to_assets(
        shares,
        crate::engine::net_market_assets(&market, cash)?,
        market.total_supply_shares,
    )?;
    if cash < assets {
        return Err(ProgramError::InsufficientFunds);
    }
    position.supply_shares = position
        .supply_shares
        .checked_sub(shares)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    market.total_supply_shares = market
        .total_supply_shares
        .checked_sub(shares)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    let bump = [market.authority_bump];
    let signer_seeds = pinocchio::instruction::seeds!(
        MARKET_AUTHORITY_SEED,
        market_account.address().as_ref(),
        &bump
    );
    crate::cpi::transfer_checked(
        token_program,
        liquidity_vault,
        loan_mint,
        lender_tokens,
        market_authority,
        assets,
        decimals,
        core::slice::from_ref(&Signer::from(&signer_seeds)),
    )?;
    position.encode(&mut position_account.try_borrow_mut()?)?;
    market.encode(&mut market_account.try_borrow_mut()?)
}

pub fn borrow_usdc(
    program_id: &Address,
    accounts: &mut [AccountView],
    data: &[u8],
) -> ProgramResult {
    validation::distinct_writable(accounts)?;
    let [borrower, global_account, market_account, position_account, borrower_tokens, liquidity_vault, loan_mint, collateral_mint, market_authority, loan_token_program, collateral_token_program, oracle_config_account, oracle_observation_account] =
        accounts
    else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };
    validation::signer(borrower)?;
    for account in [
        &*market_account,
        &*position_account,
        &*borrower_tokens,
        &*liquidity_vault,
    ] {
        validation::writable(account)?;
    }
    let mut decoder = payload(data)?;
    let amount = decoder.u64()?;
    decoder.finish()?;
    if amount == 0 {
        return Err(ProgramError::InvalidArgument);
    }
    let global = decode_global(program_id, global_account)?;
    let mut market = Market::decode(&market_account.try_borrow()?)?;
    verify_market(program_id, market_account, &market, market_authority)?;
    if global.paused() || market.borrowing_paused() || market.loan_mint != global.approved_loan_mint
    {
        return Err(ProgramError::InvalidArgument);
    }
    if loan_mint.address().as_array() != &market.loan_mint
        || collateral_mint.address().as_array() != &market.collateral_mint
    {
        return Err(ProgramError::InvalidAccountData);
    }
    verify_ata_vault(
        liquidity_vault,
        market_authority,
        loan_token_program,
        loan_mint,
        market.vault_bumps[0],
    )?;
    let (oracle_config, observation) = decode_oracle(
        program_id,
        market_account,
        oracle_config_account,
        oracle_observation_account,
    )?;
    let now = Clock::get()?.unix_timestamp;
    crate::engine::validate_oracle(&oracle_config, &observation, now)?;
    validation::owner(position_account, program_id)?;
    let mut position = BorrowerPosition::decode(&position_account.try_borrow()?)?;
    pda::verify(
        position_account.address(),
        &[
            BORROWER_POSITION_SEED,
            market_account.address().as_ref(),
            borrower.address().as_ref(),
        ],
        position.header.bump,
        program_id,
    )?;
    if position.market != *market_account.address().as_array()
        || position.owner != *borrower.address().as_array()
    {
        return Err(ProgramError::InvalidAccountData);
    }
    let borrower_token_state = validation::token_account(borrower_tokens, loan_token_program)?;
    if borrower_token_state.mint != market.loan_mint
        || borrower_token_state.authority != *borrower.address().as_array()
    {
        return Err(ProgramError::InvalidAccountData);
    }
    let loan_decimals = validation::mint_decimals(loan_mint, loan_token_program)?;
    let collateral_decimals = validation::mint_decimals(collateral_mint, collateral_token_program)?;
    let cash = validation::token_account(liquidity_vault, loan_token_program)?.amount;
    if amount > cash {
        return Err(ProgramError::InsufficientFunds);
    }
    crate::engine::accrue_market(&mut market, cash, now)?;
    let current_debt = if position.borrow_shares == 0 {
        0
    } else {
        crate::math::shares_to_debt_ceil(position.borrow_shares, market.borrow_index)?
    };
    let resulting_debt = current_debt
        .checked_add(amount)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    let total_debt = market
        .total_debt
        .checked_add(u128::from(amount))
        .ok_or(ProgramError::ArithmeticOverflow)?;
    if total_debt > u128::from(market.market_borrow_cap)
        || resulting_debt > market.wallet_borrow_cap
        || resulting_debt > observation.max_recoverable_usdc
    {
        return Err(ProgramError::InvalidArgument);
    }
    crate::engine::require_healthy(
        position.collateral_amount,
        collateral_decimals,
        resulting_debt,
        observation.price,
        oracle_config.price_decimals,
        market.lltv_bps,
    )?;
    let shares = crate::math::debt_to_shares_ceil(amount, market.borrow_index)?;
    position.borrow_shares = position
        .borrow_shares
        .checked_add(shares)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    market.total_borrow_shares = market
        .total_borrow_shares
        .checked_add(shares)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    market.total_debt = total_debt;
    let bump = [market.authority_bump];
    let signer_seeds = pinocchio::instruction::seeds!(
        MARKET_AUTHORITY_SEED,
        market_account.address().as_ref(),
        &bump
    );
    crate::cpi::transfer_checked(
        loan_token_program,
        liquidity_vault,
        loan_mint,
        borrower_tokens,
        market_authority,
        amount,
        loan_decimals,
        core::slice::from_ref(&Signer::from(&signer_seeds)),
    )?;
    position.encode(&mut position_account.try_borrow_mut()?)?;
    market.encode(&mut market_account.try_borrow_mut()?)
}

pub fn withdraw_collateral(
    program_id: &Address,
    accounts: &mut [AccountView],
    data: &[u8],
) -> ProgramResult {
    validation::distinct_writable(accounts)?;
    let [borrower, market_account, position_account, borrower_tokens, collateral_vault, collateral_mint, market_authority, collateral_token_program, oracle_config_account, oracle_observation_account, liquidity_vault, loan_mint, loan_token_program] =
        accounts
    else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };
    validation::signer(borrower)?;
    for account in [
        &*market_account,
        &*position_account,
        &*borrower_tokens,
        &*collateral_vault,
    ] {
        validation::writable(account)?;
    }
    let mut decoder = payload(data)?;
    let amount = decoder.u64()?;
    decoder.finish()?;
    if amount == 0 {
        return Err(ProgramError::InvalidArgument);
    }
    let mut market = Market::decode(&market_account.try_borrow()?)?;
    verify_market(program_id, market_account, &market, market_authority)?;
    if collateral_mint.address().as_array() != &market.collateral_mint
        || loan_mint.address().as_array() != &market.loan_mint
    {
        return Err(ProgramError::InvalidAccountData);
    }
    verify_ata_vault(
        collateral_vault,
        market_authority,
        collateral_token_program,
        collateral_mint,
        market.vault_bumps[1],
    )?;
    verify_ata_vault(
        liquidity_vault,
        market_authority,
        loan_token_program,
        loan_mint,
        market.vault_bumps[0],
    )?;
    let (oracle_config, observation) = decode_oracle(
        program_id,
        market_account,
        oracle_config_account,
        oracle_observation_account,
    )?;
    let now = Clock::get()?.unix_timestamp;
    crate::engine::validate_oracle(&oracle_config, &observation, now)?;
    validation::owner(position_account, program_id)?;
    let mut position = BorrowerPosition::decode(&position_account.try_borrow()?)?;
    pda::verify(
        position_account.address(),
        &[
            BORROWER_POSITION_SEED,
            market_account.address().as_ref(),
            borrower.address().as_ref(),
        ],
        position.header.bump,
        program_id,
    )?;
    if position.market != *market_account.address().as_array()
        || position.owner != *borrower.address().as_array()
        || position.collateral_amount < amount
    {
        return Err(ProgramError::InvalidAccountData);
    }
    let user_tokens = validation::token_account(borrower_tokens, collateral_token_program)?;
    if user_tokens.mint != market.collateral_mint
        || user_tokens.authority != *borrower.address().as_array()
    {
        return Err(ProgramError::InvalidAccountData);
    }
    let collateral_decimals = validation::mint_decimals(collateral_mint, collateral_token_program)?;
    let cash = validation::token_account(liquidity_vault, loan_token_program)?.amount;
    crate::engine::accrue_market(&mut market, cash, now)?;
    let debt = if position.borrow_shares == 0 {
        0
    } else {
        crate::math::shares_to_debt_ceil(position.borrow_shares, market.borrow_index)?
    };
    let remaining = position
        .collateral_amount
        .checked_sub(amount)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    crate::engine::require_healthy(
        remaining,
        collateral_decimals,
        debt,
        observation.price,
        oracle_config.price_decimals,
        market.lltv_bps,
    )?;
    let bump = [market.authority_bump];
    let signer_seeds = pinocchio::instruction::seeds!(
        MARKET_AUTHORITY_SEED,
        market_account.address().as_ref(),
        &bump
    );
    crate::cpi::transfer_checked(
        collateral_token_program,
        collateral_vault,
        collateral_mint,
        borrower_tokens,
        market_authority,
        amount,
        collateral_decimals,
        core::slice::from_ref(&Signer::from(&signer_seeds)),
    )?;
    position.collateral_amount = remaining;
    position.encode(&mut position_account.try_borrow_mut()?)?;
    market.encode(&mut market_account.try_borrow_mut()?)
}

pub fn submit_oracle_observation(
    program_id: &Address,
    accounts: &mut [AccountView],
    data: &[u8],
) -> ProgramResult {
    let [publisher, market_account, config_account, observation_account] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };
    validation::signer(publisher)?;
    validation::writable(publisher)?;
    validation::writable(observation_account)?;
    validation::owner(market_account, program_id)?;
    validation::owner(config_account, program_id)?;
    let config = OracleConfiguration::decode(&config_account.try_borrow()?)?;
    pda::verify(
        config_account.address(),
        &[ORACLE_CONFIG_SEED, market_account.address().as_ref()],
        config.header.bump,
        program_id,
    )?;
    if config.market != *market_account.address().as_array() {
        return Err(ProgramError::InvalidAccountData);
    }
    let publisher_bytes = *publisher.address().as_array();
    if !config.sources[..usize::from(config.source_count)].contains(&publisher_bytes) {
        return Err(ProgramError::InvalidArgument);
    }
    let mut decoder = payload(data)?;
    let price = decoder.u128()?;
    let confidence_bps = decoder.u16()?;
    let deviation_bps = decoder.u16()?;
    let max_recoverable_usdc = decoder.u64()?;
    let published_at = decoder.i64()?;
    let sequence = decoder.u64()?;
    let bump = decoder.u8()?;
    decoder.finish()?;
    let now = Clock::get()?.unix_timestamp;
    if price == 0
        || max_recoverable_usdc == 0
        || published_at > now
        || confidence_bps > config.max_confidence_bps
        || deviation_bps > config.max_deviation_bps
    {
        return Err(ProgramError::InvalidArgument);
    }
    let header = if observation_account.is_data_empty() {
        if publisher_bytes != config.sources[0] {
            return Err(ProgramError::InvalidArgument);
        }
        let seeds = [ORACLE_OBSERVATION_SEED, market_account.address().as_ref()];
        pda::verify_canonical(observation_account.address(), &seeds, bump, program_id)?;
        let bump_seed = [bump];
        let signer_seeds = pinocchio::instruction::seeds!(
            ORACLE_OBSERVATION_SEED,
            market_account.address().as_ref(),
            &bump_seed
        );
        create_program_account(
            publisher,
            observation_account,
            program_id,
            OracleObservation::LEN,
            &Signer::from(&signer_seeds),
        )?;
        AccountHeader {
            version: STATE_VERSION,
            kind: AccountKind::OracleObservation,
            bump,
        }
    } else {
        validation::owner(observation_account, program_id)?;
        let previous = OracleObservation::decode(&observation_account.try_borrow()?)?;
        pda::verify(
            observation_account.address(),
            &[ORACLE_OBSERVATION_SEED, market_account.address().as_ref()],
            previous.header.bump,
            program_id,
        )?;
        if previous.market != *market_account.address().as_array()
            || sequence <= previous.sequence
            || published_at < previous.published_at
        {
            return Err(ProgramError::InvalidArgument);
        }
        previous.header
    };
    OracleObservation {
        header,
        market: *market_account.address().as_array(),
        publisher: publisher_bytes,
        price,
        confidence_bps,
        deviation_bps,
        max_recoverable_usdc,
        published_at,
        sequence,
    }
    .encode(&mut observation_account.try_borrow_mut()?)
}

pub fn deposit_first_loss_reserve(
    program_id: &Address,
    accounts: &mut [AccountView],
    data: &[u8],
) -> ProgramResult {
    validation::distinct_writable(accounts)?;
    let [depositor, market_account, reserve_account, depositor_tokens, reserve_vault, loan_mint, market_authority, token_program] =
        accounts
    else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };
    validation::signer(depositor)?;
    for account in [&*reserve_account, &*depositor_tokens, &*reserve_vault] {
        validation::writable(account)?;
    }
    let mut decoder = payload(data)?;
    let amount = decoder.u64()?;
    decoder.finish()?;
    if amount == 0 {
        return Err(ProgramError::InvalidArgument);
    }
    let market = Market::decode(&market_account.try_borrow()?)?;
    verify_market(program_id, market_account, &market, market_authority)?;
    if loan_mint.address().as_array() != &market.loan_mint {
        return Err(ProgramError::InvalidAccountData);
    }
    verify_reserve_vault(
        program_id,
        reserve_vault,
        market_account,
        &market,
        market_authority,
        token_program,
    )?;
    validation::owner(reserve_account, program_id)?;
    let mut reserve = FirstLossReserve::decode(&reserve_account.try_borrow()?)?;
    pda::verify(
        reserve_account.address(),
        &[RESERVE_SEED, market_account.address().as_ref()],
        reserve.header.bump,
        program_id,
    )?;
    if reserve.market != *market_account.address().as_array() {
        return Err(ProgramError::InvalidAccountData);
    }
    let source = validation::token_account(depositor_tokens, token_program)?;
    if source.mint != market.loan_mint || source.authority != *depositor.address().as_array() {
        return Err(ProgramError::InvalidAccountData);
    }
    let decimals = validation::mint_decimals(loan_mint, token_program)?;
    crate::cpi::transfer_checked(
        token_program,
        depositor_tokens,
        loan_mint,
        reserve_vault,
        depositor,
        amount,
        decimals,
        &[],
    )?;
    reserve.deposited = reserve
        .deposited
        .checked_add(amount)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    reserve.encode(&mut reserve_account.try_borrow_mut()?)
}

pub fn claim_market_creator_fees(
    program_id: &Address,
    accounts: &mut [AccountView],
    data: &[u8],
) -> ProgramResult {
    validation::distinct_writable(accounts)?;
    let [creator, market_account, destination, liquidity_vault, loan_mint, market_authority, token_program] =
        accounts
    else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };
    validation::signer(creator)?;
    for account in [&*market_account, &*destination, &*liquidity_vault] {
        validation::writable(account)?;
    }
    let mut decoder = payload(data)?;
    let amount = decoder.u64()?;
    decoder.finish()?;
    let mut market = Market::decode(&market_account.try_borrow()?)?;
    verify_market(program_id, market_account, &market, market_authority)?;
    if market.creator != *creator.address().as_array()
        || loan_mint.address().as_array() != &market.loan_mint
    {
        return Err(ProgramError::InvalidArgument);
    }
    verify_ata_vault(
        liquidity_vault,
        market_authority,
        token_program,
        loan_mint,
        market.vault_bumps[0],
    )?;
    let destination_state = validation::token_account(destination, token_program)?;
    if destination_state.mint != market.loan_mint
        || destination_state.authority != *creator.address().as_array()
    {
        return Err(ProgramError::InvalidAccountData);
    }
    let decimals = validation::mint_decimals(loan_mint, token_program)?;
    let cash = validation::token_account(liquidity_vault, token_program)?.amount;
    crate::engine::accrue_market(&mut market, cash, Clock::get()?.unix_timestamp)?;
    if amount == 0 || amount > market.creator_fees_claimable || amount > cash {
        return Err(ProgramError::InsufficientFunds);
    }
    market.creator_fees_claimable = market
        .creator_fees_claimable
        .checked_sub(amount)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    let bump = [market.authority_bump];
    let signer_seeds = pinocchio::instruction::seeds!(
        MARKET_AUTHORITY_SEED,
        market_account.address().as_ref(),
        &bump
    );
    crate::cpi::transfer_checked(
        token_program,
        liquidity_vault,
        loan_mint,
        destination,
        market_authority,
        amount,
        decimals,
        core::slice::from_ref(&Signer::from(&signer_seeds)),
    )?;
    market.encode(&mut market_account.try_borrow_mut()?)
}

pub fn claim_protocol_fees(
    program_id: &Address,
    accounts: &mut [AccountView],
    data: &[u8],
) -> ProgramResult {
    validation::distinct_writable(accounts)?;
    let [authority, global_account, recipient, market_account, destination, liquidity_vault, loan_mint, market_authority, token_program] =
        accounts
    else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };
    validation::signer(authority)?;
    for account in [&*market_account, &*destination, &*liquidity_vault] {
        validation::writable(account)?;
    }
    let global = decode_global(program_id, global_account)?;
    if global.authority != *authority.address().as_array()
        || global.protocol_fee_recipient != *recipient.address().as_array()
    {
        return Err(ProgramError::InvalidArgument);
    }
    let mut decoder = payload(data)?;
    let amount = decoder.u64()?;
    decoder.finish()?;
    let mut market = Market::decode(&market_account.try_borrow()?)?;
    verify_market(program_id, market_account, &market, market_authority)?;
    if loan_mint.address().as_array() != &market.loan_mint {
        return Err(ProgramError::InvalidAccountData);
    }
    verify_ata_vault(
        liquidity_vault,
        market_authority,
        token_program,
        loan_mint,
        market.vault_bumps[0],
    )?;
    let destination_state = validation::token_account(destination, token_program)?;
    if destination_state.mint != market.loan_mint
        || destination_state.authority != *recipient.address().as_array()
    {
        return Err(ProgramError::InvalidAccountData);
    }
    let decimals = validation::mint_decimals(loan_mint, token_program)?;
    let cash = validation::token_account(liquidity_vault, token_program)?.amount;
    crate::engine::accrue_market(&mut market, cash, Clock::get()?.unix_timestamp)?;
    if amount == 0 || amount > market.protocol_fees_claimable || amount > cash {
        return Err(ProgramError::InsufficientFunds);
    }
    market.protocol_fees_claimable = market
        .protocol_fees_claimable
        .checked_sub(amount)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    let bump = [market.authority_bump];
    let signer_seeds = pinocchio::instruction::seeds!(
        MARKET_AUTHORITY_SEED,
        market_account.address().as_ref(),
        &bump
    );
    crate::cpi::transfer_checked(
        token_program,
        liquidity_vault,
        loan_mint,
        destination,
        market_authority,
        amount,
        decimals,
        core::slice::from_ref(&Signer::from(&signer_seeds)),
    )?;
    market.encode(&mut market_account.try_borrow_mut()?)
}

pub fn liquidate(program_id: &Address, accounts: &mut [AccountView], data: &[u8]) -> ProgramResult {
    validation::distinct_writable(accounts)?;
    let [liquidator, market_account, position_account, liquidator_usdc, liquidator_collateral, liquidity_vault, collateral_vault, reserve_account, reserve_vault, loan_mint, collateral_mint, market_authority, loan_token_program, collateral_token_program, oracle_config_account, oracle_observation_account] =
        accounts
    else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };
    validation::signer(liquidator)?;
    for account in [
        &*market_account,
        &*position_account,
        &*liquidator_usdc,
        &*liquidator_collateral,
        &*liquidity_vault,
        &*collateral_vault,
        &*reserve_account,
        &*reserve_vault,
    ] {
        validation::writable(account)?;
    }
    let mut decoder = payload(data)?;
    let requested = decoder.u64()?;
    decoder.finish()?;
    let mut market = Market::decode(&market_account.try_borrow()?)?;
    verify_market(program_id, market_account, &market, market_authority)?;
    if loan_mint.address().as_array() != &market.loan_mint
        || collateral_mint.address().as_array() != &market.collateral_mint
    {
        return Err(ProgramError::InvalidAccountData);
    }
    verify_ata_vault(
        liquidity_vault,
        market_authority,
        loan_token_program,
        loan_mint,
        market.vault_bumps[0],
    )?;
    verify_ata_vault(
        collateral_vault,
        market_authority,
        collateral_token_program,
        collateral_mint,
        market.vault_bumps[1],
    )?;
    verify_reserve_vault(
        program_id,
        reserve_vault,
        market_account,
        &market,
        market_authority,
        loan_token_program,
    )?;
    let (oracle_config, observation) = decode_oracle(
        program_id,
        market_account,
        oracle_config_account,
        oracle_observation_account,
    )?;
    let now = Clock::get()?.unix_timestamp;
    crate::engine::validate_oracle(&oracle_config, &observation, now)?;
    validation::owner(position_account, program_id)?;
    let mut position = BorrowerPosition::decode(&position_account.try_borrow()?)?;
    let borrower = Address::new_from_array(position.owner);
    pda::verify(
        position_account.address(),
        &[
            BORROWER_POSITION_SEED,
            market_account.address().as_ref(),
            borrower.as_ref(),
        ],
        position.header.bump,
        program_id,
    )?;
    if position.market != *market_account.address().as_array() {
        return Err(ProgramError::InvalidAccountData);
    }
    validation::owner(reserve_account, program_id)?;
    let mut reserve = FirstLossReserve::decode(&reserve_account.try_borrow()?)?;
    pda::verify(
        reserve_account.address(),
        &[RESERVE_SEED, market_account.address().as_ref()],
        reserve.header.bump,
        program_id,
    )?;
    if reserve.market != *market_account.address().as_array() {
        return Err(ProgramError::InvalidAccountData);
    }
    let liquidator_loan = validation::token_account(liquidator_usdc, loan_token_program)?;
    let liquidator_collat =
        validation::token_account(liquidator_collateral, collateral_token_program)?;
    if liquidator_loan.mint != market.loan_mint
        || liquidator_loan.authority != *liquidator.address().as_array()
        || liquidator_collat.mint != market.collateral_mint
        || liquidator_collat.authority != *liquidator.address().as_array()
    {
        return Err(ProgramError::InvalidAccountData);
    }
    let loan_decimals = validation::mint_decimals(loan_mint, loan_token_program)?;
    let collateral_decimals = validation::mint_decimals(collateral_mint, collateral_token_program)?;
    let cash = validation::token_account(liquidity_vault, loan_token_program)?.amount;
    let reserve_cash = validation::token_account(reserve_vault, loan_token_program)?.amount;
    crate::engine::accrue_market(&mut market, cash, now)?;
    let debt = crate::math::shares_to_debt_ceil(position.borrow_shares, market.borrow_index)?;
    let value = crate::math::collateral_value(
        position.collateral_amount,
        collateral_decimals,
        observation.price,
        oracle_config.price_decimals,
    )?;
    if debt <= crate::math::max_debt_for_collateral(value, market.lltv_bps)? {
        return Err(ProgramError::InvalidArgument);
    }
    let (repaid, seized) = crate::math::liquidation_amounts(
        requested,
        debt,
        position.collateral_amount,
        collateral_decimals,
        observation.price,
        oracle_config.price_decimals,
        market.close_factor_bps,
        market.liquidation_bonus_bps,
    )?;
    let shares = crate::math::liquidation_shares_to_burn(repaid, debt, position.borrow_shares)?;
    crate::cpi::transfer_checked(
        loan_token_program,
        liquidator_usdc,
        loan_mint,
        liquidity_vault,
        liquidator,
        repaid,
        loan_decimals,
        &[],
    )?;
    let authority_bump = [market.authority_bump];
    let authority_seeds = pinocchio::instruction::seeds!(
        MARKET_AUTHORITY_SEED,
        market_account.address().as_ref(),
        &authority_bump
    );
    let authority_signer = Signer::from(&authority_seeds);
    crate::cpi::transfer_checked(
        collateral_token_program,
        collateral_vault,
        collateral_mint,
        liquidator_collateral,
        market_authority,
        seized,
        collateral_decimals,
        core::slice::from_ref(&authority_signer),
    )?;
    position.borrow_shares = position
        .borrow_shares
        .checked_sub(shares)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    position.collateral_amount = position
        .collateral_amount
        .checked_sub(seized)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    market.total_borrow_shares = market
        .total_borrow_shares
        .checked_sub(shares)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    market.total_debt = market
        .total_debt
        .checked_sub(u128::from(repaid))
        .ok_or(ProgramError::ArithmeticOverflow)?;
    if position.collateral_amount == 0 && position.borrow_shares > 0 {
        let bad_debt =
            crate::math::shares_to_debt_ceil(position.borrow_shares, market.borrow_index)?;
        market.total_borrow_shares = market
            .total_borrow_shares
            .checked_sub(position.borrow_shares)
            .ok_or(ProgramError::ArithmeticOverflow)?;
        market.total_debt = market
            .total_debt
            .checked_sub(u128::from(bad_debt))
            .ok_or(ProgramError::ArithmeticOverflow)?;
        position.borrow_shares = 0;
        market.bad_debt = market
            .bad_debt
            .checked_add(bad_debt)
            .ok_or(ProgramError::ArithmeticOverflow)?;
        let absorbed = bad_debt.min(reserve_cash).min(reserve.deposited);
        if absorbed > 0 {
            crate::cpi::transfer_checked(
                loan_token_program,
                reserve_vault,
                loan_mint,
                liquidity_vault,
                market_authority,
                absorbed,
                loan_decimals,
                core::slice::from_ref(&authority_signer),
            )?;
            reserve.deposited = reserve
                .deposited
                .checked_sub(absorbed)
                .ok_or(ProgramError::ArithmeticOverflow)?;
            reserve.absorbed_losses = reserve
                .absorbed_losses
                .checked_add(absorbed)
                .ok_or(ProgramError::ArithmeticOverflow)?;
        }
    }
    position.encode(&mut position_account.try_borrow_mut()?)?;
    reserve.encode(&mut reserve_account.try_borrow_mut()?)?;
    market.encode(&mut market_account.try_borrow_mut()?)
}
