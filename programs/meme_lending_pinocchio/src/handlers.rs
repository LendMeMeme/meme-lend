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
        LENDER_POSITION_SEED, MARKET_AUTHORITY_SEED, MARKET_SEED,
    },
    state::{
        AccountHeader, AccountKind, BorrowerPosition, GlobalConfig, LenderPosition, Market,
        GLOBAL_FLAG_PAUSED, MARKET_FLAG_BORROWING_PAUSED, MARKET_FLAG_REWARDS_ENABLED,
        STATE_VERSION,
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
