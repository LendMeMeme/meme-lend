use pinocchio::{
    cpi::Signer,
    error::ProgramError,
    sysvars::{clock::Clock, Sysvar},
    AccountView, Address, ProgramResult,
};

use crate::{
    codec::Decoder,
    cpi::create_program_account,
    pda::{self, ASSOCIATED_TOKEN_PROGRAM, GLOBAL_CONFIG_SEED, MARKET_AUTHORITY_SEED, MARKET_SEED},
    state::{
        AccountHeader, AccountKind, GlobalConfig, Market, GLOBAL_FLAG_PAUSED,
        MARKET_FLAG_BORROWING_PAUSED, STATE_VERSION,
    },
    validation, INITIAL_AUTHORITY,
};

fn payload(data: &[u8]) -> Result<Decoder<'_>, ProgramError> {
    data.get(1..)
        .map(Decoder::new)
        .ok_or(ProgramError::InvalidInstructionData)
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
