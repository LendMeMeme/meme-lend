use anchor_lang::prelude::*;

#[event]
pub struct ProtocolInitialized {
    pub authority: Pubkey,
    pub loan_mint: Pubkey,
}

#[event]
pub struct ProtocolPauseChanged {
    pub authority: Pubkey,
    pub paused: bool,
}

#[event]
pub struct MarketCreated {
    pub market: Pubkey,
    pub creator: Pubkey,
    pub collateral_mint: Pubkey,
    pub loan_mint: Pubkey,
    pub config_hash: [u8; 32],
    pub custom_oracle_high_risk: bool,
}

#[event]
pub struct MarketPauseChanged {
    pub market: Pubkey,
    pub borrowing_paused: bool,
}

#[event]
pub struct LiquiditySupplied {
    pub market: Pubkey,
    pub lender: Pubkey,
    pub assets: u64,
    pub shares: u128,
}

#[event]
pub struct LiquidityWithdrawn {
    pub market: Pubkey,
    pub lender: Pubkey,
    pub assets: u64,
    pub shares: u128,
}

#[event]
pub struct InterestAccrued {
    pub market: Pubkey,
    pub interest: u64,
    pub borrow_index: u128,
}

#[event]
pub struct CollateralDeposited {
    pub market: Pubkey,
    pub borrower: Pubkey,
    pub amount: u64,
}

#[event]
pub struct CollateralWithdrawn {
    pub market: Pubkey,
    pub borrower: Pubkey,
    pub amount: u64,
}

#[event]
pub struct UsdcBorrowed {
    pub market: Pubkey,
    pub borrower: Pubkey,
    pub amount: u64,
    pub debt_shares: u128,
}

#[event]
pub struct UsdcRepaid {
    pub market: Pubkey,
    pub payer: Pubkey,
    pub borrower: Pubkey,
    pub amount: u64,
    pub debt_shares: u128,
}

#[event]
pub struct OracleObserved {
    pub market: Pubkey,
    pub publisher: Pubkey,
    pub price: u128,
    pub max_recoverable_usdc: u64,
    pub published_at: i64,
    pub sequence: u64,
}

#[event]
pub struct PositionLiquidated {
    pub market: Pubkey,
    pub borrower: Pubkey,
    pub liquidator: Pubkey,
    pub repaid: u64,
    pub collateral_seized: u64,
    pub bad_debt: u64,
    pub reserve_absorbed: u64,
}

#[event]
pub struct FirstLossReserveFunded {
    pub market: Pubkey,
    pub contributor: Pubkey,
    pub amount: u64,
}

#[event]
pub struct CreatorFeesClaimed {
    pub market: Pubkey,
    pub creator: Pubkey,
    pub amount: u64,
}

#[event]
pub struct LenderRewardsFunded {
    pub market: Pubkey,
    pub funder: Pubkey,
    pub reward_mint: Pubkey,
    pub amount: u64,
}

#[event]
pub struct LenderRewardsClaimed {
    pub market: Pubkey,
    pub lender: Pubkey,
    pub reward_mint: Pubkey,
    pub amount: u64,
}

#[event]
pub struct ProtocolFeesClaimed {
    pub market: Pubkey,
    pub recipient: Pubkey,
    pub amount: u64,
}
