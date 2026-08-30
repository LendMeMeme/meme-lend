use anchor_lang::prelude::*;

#[error_code]
pub enum LendingError {
    #[msg("The supplied parameter is outside the approved range")]
    InvalidParameter,
    #[msg("The account does not belong to this market")]
    MarketMismatch,
    #[msg("The token mint or token program is not approved")]
    UnsupportedToken,
    #[msg("The oracle configuration is invalid or unavailable")]
    InvalidOracle,
    #[msg("The requested operation would overflow")]
    MathOverflow,
    #[msg("The protocol or market has paused this action")]
    Paused,
    #[msg("Only the configured authority may perform this action")]
    Unauthorized,
    #[msg("The immutable market configuration does not match its hash")]
    InvalidConfigHash,
    #[msg("The vault is not the canonical vault for this market")]
    InvalidVault,
    #[msg("A risk-increasing action requires a fresh oracle observation")]
    OracleUnavailable,
    #[msg("The operation would create a zero-value position")]
    AmountTooSmall,
    #[msg("The requested amount is not available")]
    InsufficientLiquidity,
    #[msg("The resulting borrower position would be unhealthy")]
    UnhealthyPosition,
    #[msg("The borrower position is not liquidatable")]
    PositionHealthy,
    #[msg("Fees cannot exceed accrued interest")]
    ExcessiveFees,
    #[msg("The mint uses a Token-2022 extension unsupported by this market")]
    UnsupportedTokenExtension,
    #[msg("The active market rewards account is required for this share mutation")]
    RewardsAccountRequired,
}
