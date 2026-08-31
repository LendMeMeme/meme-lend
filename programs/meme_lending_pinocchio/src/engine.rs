use pinocchio::error::ProgramError;

use crate::{
    constants::*,
    math,
    state::{Market, OracleConfiguration, OracleObservation},
};

#[derive(Clone, Copy)]
struct RateModel {
    base: u64,
    target_bps: u16,
    slope_low: u64,
    slope_high: u64,
    max: u64,
}

#[inline(always)]
fn rate_model(id: u8) -> Result<RateModel, ProgramError> {
    match id {
        0 => Ok(RateModel {
            base: STANDARD_BASE_RATE,
            target_bps: STANDARD_TARGET_UTILIZATION_BPS,
            slope_low: STANDARD_SLOPE_LOW,
            slope_high: STANDARD_SLOPE_HIGH,
            max: STANDARD_MAX_RATE,
        }),
        1 => Ok(RateModel {
            base: CONSERVATIVE_BASE_RATE,
            target_bps: CONSERVATIVE_TARGET_UTILIZATION_BPS,
            slope_low: CONSERVATIVE_SLOPE_LOW,
            slope_high: CONSERVATIVE_SLOPE_HIGH,
            max: CONSERVATIVE_MAX_RATE,
        }),
        _ => Err(ProgramError::InvalidAccountData),
    }
}

pub fn net_market_assets(market: &Market, cash: u64) -> Result<u128, ProgramError> {
    u128::from(cash)
        .checked_add(market.total_debt)
        .and_then(|value| value.checked_sub(u128::from(market.creator_fees_claimable)))
        .and_then(|value| value.checked_sub(u128::from(market.protocol_fees_claimable)))
        .ok_or(ProgramError::ArithmeticOverflow)
}

pub fn accrue_market(market: &mut Market, cash: u64, now: i64) -> Result<u64, ProgramError> {
    let elapsed = now
        .checked_sub(market.last_accrual_timestamp)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    if elapsed < 0 {
        return Err(ProgramError::InvalidArgument);
    }
    if elapsed == 0 || market.total_debt == 0 {
        market.last_accrual_timestamp = now;
        return Ok(0);
    }
    let model = rate_model(market.rate_model_id)?;
    let utilization = math::utilization(cash, market.total_debt)?;
    let rate = math::borrow_rate(
        utilization,
        model.base,
        model.target_bps,
        model.slope_low,
        model.slope_high,
        model.max,
    )?;
    let new_index = math::accrue_index(market.borrow_index, rate, elapsed as u64)?;
    let new_debt = math::mul_div_ceil(market.total_debt, new_index, market.borrow_index)?;
    let interest = new_debt
        .checked_sub(market.total_debt)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    let creator_fee = math::mul_div_floor(
        interest,
        u128::from(market.creator_fee_bps),
        u128::from(BPS_DENOMINATOR),
    )?;
    let protocol_fee = math::mul_div_floor(
        interest,
        u128::from(market.protocol_fee_bps),
        u128::from(BPS_DENOMINATOR),
    )?;
    if creator_fee
        .checked_add(protocol_fee)
        .ok_or(ProgramError::ArithmeticOverflow)?
        > interest
    {
        return Err(ProgramError::InvalidArgument);
    }
    market.total_debt = new_debt;
    market.borrow_index = new_index;
    market.creator_fees_claimable = market
        .creator_fees_claimable
        .checked_add(u64::try_from(creator_fee).map_err(|_| ProgramError::ArithmeticOverflow)?)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    market.protocol_fees_claimable = market
        .protocol_fees_claimable
        .checked_add(u64::try_from(protocol_fee).map_err(|_| ProgramError::ArithmeticOverflow)?)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    market.last_accrual_timestamp = now;
    u64::try_from(interest).map_err(|_| ProgramError::ArithmeticOverflow)
}

pub fn validate_oracle(
    config: &OracleConfiguration,
    observation: &OracleObservation,
    now: i64,
) -> Result<(), ProgramError> {
    if config.market != observation.market
        || observation.price == 0
        || observation.max_recoverable_usdc == 0
        || observation.confidence_bps > config.max_confidence_bps
        || observation.deviation_bps > config.max_deviation_bps
    {
        return Err(ProgramError::InvalidArgument);
    }
    let age = now
        .checked_sub(observation.published_at)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    if age < 0 || age > i64::from(config.max_age_seconds) {
        return Err(ProgramError::InvalidArgument);
    }
    Ok(())
}

pub fn require_healthy(
    collateral: u64,
    collateral_decimals: u8,
    debt: u64,
    price: u128,
    price_decimals: u8,
    lltv_bps: u16,
) -> Result<(), ProgramError> {
    if debt == 0 {
        return Ok(());
    }
    let value = math::collateral_value(collateral, collateral_decimals, price, price_decimals)?;
    if debt > math::max_debt_for_collateral(value, lltv_bps)? {
        return Err(ProgramError::InvalidArgument);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::{AccountHeader, AccountKind, STATE_VERSION};

    fn market() -> Market {
        Market {
            header: AccountHeader {
                version: STATE_VERSION,
                kind: AccountKind::Market,
                bump: 1,
            },
            authority_bump: 2,
            creator: [1; 32],
            collateral_mint: [2; 32],
            loan_mint: [3; 32],
            config_hash: [4; 32],
            lltv_bps: 6_500,
            liquidation_bonus_bps: 1_000,
            close_factor_bps: 5_000,
            creator_fee_bps: 100,
            protocol_fee_bps: 100,
            rate_model_id: 0,
            flags: 0,
            token_program_flags: 0,
            market_borrow_cap: 1_000_000,
            wallet_borrow_cap: 100_000,
            total_supply_shares: 100_000,
            total_borrow_shares: 50_000,
            borrow_index: RATE_SCALE,
            total_debt: 50_000,
            bad_debt: 0,
            creator_fees_claimable: 0,
            protocol_fees_claimable: 0,
            last_accrual_timestamp: 1,
        }
    }

    #[test]
    fn accrual_is_monotonic_and_fees_never_exceed_interest() {
        let mut market = market();
        let interest = accrue_market(&mut market, 50_000, 86_401).unwrap();
        assert!(interest > 0);
        assert!(market.borrow_index > RATE_SCALE);
        assert!(market.creator_fees_claimable + market.protocol_fees_claimable <= interest);
    }

    #[test]
    fn repayment_path_does_not_need_an_oracle() {
        let market = market();
        assert_eq!(net_market_assets(&market, 50_000).unwrap(), 100_000);
        // Oracle validation is intentionally a separate function; repay/deposit handlers do not call it.
    }
}
