use crate::constants::*;
use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct GlobalConfig {
    pub authority: Pubkey,
    pub pending_authority: Pubkey,
    pub approved_loan_mint: Pubkey,
    pub protocol_fee_recipient: Pubkey,
    pub market_count: u64,
    pub max_oracle_age_seconds: u32,
    pub paused: bool,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace, PartialEq, Eq)]
pub enum OracleKind {
    Pyth,
    Switchboard,
    DexTwap,
    AggregatedPools,
    Custom,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct InterestRateModel {
    pub base_rate: u64,
    pub target_utilization_bps: u16,
    pub slope_low: u64,
    pub slope_high: u64,
    pub max_borrow_rate: u64,
}

#[account]
#[derive(InitSpace)]
pub struct OracleConfiguration {
    pub market: Pubkey,
    pub kind: OracleKind,
    pub collateral_mint: Pubkey,
    pub loan_mint: Pubkey,
    pub max_age_seconds: u32,
    pub max_confidence_bps: u16,
    pub max_deviation_bps: u16,
    pub price_decimals: u8,
    pub source_count: u8,
    #[max_len(MAX_ORACLE_SOURCES)]
    pub sources: Vec<Pubkey>,
    pub custom_high_risk: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct OracleObservation {
    pub market: Pubkey,
    pub publisher: Pubkey,
    pub price: u128,
    pub confidence_bps: u16,
    pub deviation_bps: u16,
    pub max_recoverable_usdc: u64,
    pub published_at: i64,
    pub sequence: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Market {
    pub global_config: Pubkey,
    pub creator: Pubkey,
    pub collateral_mint: Pubkey,
    pub loan_mint: Pubkey,
    pub collateral_token_program: Pubkey,
    pub loan_token_program: Pubkey,
    pub liquidity_vault: Pubkey,
    pub collateral_vault: Pubkey,
    pub oracle_configuration: Pubkey,
    pub active_rewards: Pubkey,
    pub config_hash: [u8; 32],
    pub lltv_bps: u16,
    pub liquidation_bonus_bps: u16,
    pub close_factor_bps: u16,
    pub creator_fee_bps: u16,
    pub protocol_fee_bps: u16,
    pub rate_model: InterestRateModel,
    pub market_borrow_cap: u64,
    pub wallet_borrow_cap: u64,
    pub total_supply_shares: u128,
    pub total_borrow_shares: u128,
    pub borrow_index: u128,
    pub total_debt: u128,
    pub bad_debt: u64,
    pub creator_fees_claimable: u64,
    pub protocol_fees_claimable: u64,
    pub last_accrual_timestamp: i64,
    pub borrowing_paused: bool,
    pub bump: u8,
    pub authority_bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct LenderPosition {
    pub market: Pubkey,
    pub owner: Pubkey,
    pub supply_shares: u128,
    pub reward_index_checkpoint: u128,
    pub reward_owed: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct BorrowerPosition {
    pub market: Pubkey,
    pub owner: Pubkey,
    pub collateral_amount: u64,
    pub borrow_shares: u128,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct MarketRewards {
    pub market: Pubkey,
    pub reward_mint: Pubkey,
    pub reward_vault: Pubkey,
    pub reward_index: u128,
    pub undistributed_rewards: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct FirstLossReserve {
    pub market: Pubkey,
    pub vault: Pubkey,
    pub deposited: u64,
    pub absorbed_losses: u64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CreateMarketArgs {
    pub config_hash: [u8; 32],
    pub lltv_bps: u16,
    pub liquidation_bonus_bps: u16,
    pub close_factor_bps: u16,
    pub creator_fee_bps: u16,
    pub protocol_fee_bps: u16,
    pub rate_model: InterestRateModel,
    pub market_borrow_cap: u64,
    pub wallet_borrow_cap: u64,
    pub oracle_kind: OracleKind,
    pub oracle_max_age_seconds: u32,
    pub oracle_max_confidence_bps: u16,
    pub oracle_max_deviation_bps: u16,
    pub oracle_price_decimals: u8,
    pub oracle_sources: Vec<Pubkey>,
}
