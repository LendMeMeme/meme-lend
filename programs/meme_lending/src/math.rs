use crate::{constants::*, errors::LendingError};
use anchor_lang::prelude::*;

pub fn mul_div_floor(a: u128, b: u128, denominator: u128) -> Result<u128> {
    require!(denominator != 0, LendingError::InvalidParameter);
    a.checked_mul(b)
        .ok_or(LendingError::MathOverflow)?
        .checked_div(denominator)
        .ok_or(LendingError::MathOverflow.into())
}

pub fn mul_div_ceil(a: u128, b: u128, denominator: u128) -> Result<u128> {
    require!(denominator != 0, LendingError::InvalidParameter);
    let product = a.checked_mul(b).ok_or(LendingError::MathOverflow)?;
    let adjustment = denominator
        .checked_sub(1)
        .ok_or(LendingError::MathOverflow)?;
    product
        .checked_add(adjustment)
        .ok_or(LendingError::MathOverflow)?
        .checked_div(denominator)
        .ok_or(LendingError::MathOverflow.into())
}

pub fn utilization(cash: u64, debt: u128) -> Result<u128> {
    let cash = u128::from(cash);
    let assets = cash.checked_add(debt).ok_or(LendingError::MathOverflow)?;
    if debt == 0 || assets == 0 {
        return Ok(0);
    }
    mul_div_floor(debt, RATE_SCALE, assets)
}

pub fn borrow_rate(
    utilization: u128,
    base_rate: u64,
    target_utilization_bps: u16,
    slope_low: u64,
    slope_high: u64,
    max_rate: u64,
) -> Result<u128> {
    let target = mul_div_floor(
        u128::from(target_utilization_bps),
        RATE_SCALE,
        u128::from(BPS_DENOMINATOR),
    )?;
    require!(
        target > 0 && target < RATE_SCALE,
        LendingError::InvalidParameter
    );

    let rate = if utilization <= target {
        u128::from(base_rate)
            .checked_add(mul_div_floor(u128::from(slope_low), utilization, target)?)
            .ok_or(LendingError::MathOverflow)?
    } else {
        let above = utilization
            .checked_sub(target)
            .ok_or(LendingError::MathOverflow)?;
        let remaining = RATE_SCALE
            .checked_sub(target)
            .ok_or(LendingError::MathOverflow)?;
        u128::from(base_rate)
            .checked_add(u128::from(slope_low))
            .and_then(|value| {
                value.checked_add(mul_div_floor(u128::from(slope_high), above, remaining).ok()?)
            })
            .ok_or(LendingError::MathOverflow)?
    };
    Ok(rate.min(u128::from(max_rate)))
}

pub fn accrue_index(index: u128, annual_rate: u128, elapsed_seconds: u64) -> Result<u128> {
    let growth = mul_div_ceil(
        annual_rate,
        u128::from(elapsed_seconds),
        u128::from(SECONDS_PER_YEAR),
    )?;
    let delta = mul_div_ceil(index, growth, RATE_SCALE)?;
    index
        .checked_add(delta)
        .ok_or(LendingError::MathOverflow.into())
}

pub fn assets_to_shares(assets: u64, total_assets: u128, total_shares: u128) -> Result<u128> {
    require!(assets > 0, LendingError::AmountTooSmall);
    if total_shares == 0 {
        return Ok(u128::from(assets));
    }
    require!(total_assets > 0, LendingError::InvalidParameter);
    let shares = mul_div_floor(u128::from(assets), total_shares, total_assets)?;
    require!(shares > 0, LendingError::AmountTooSmall);
    Ok(shares)
}

pub fn shares_to_assets(shares: u128, total_assets: u128, total_shares: u128) -> Result<u64> {
    require!(shares > 0 && total_shares > 0, LendingError::AmountTooSmall);
    let assets = mul_div_floor(shares, total_assets, total_shares)?;
    require!(assets > 0, LendingError::AmountTooSmall);
    u64::try_from(assets).map_err(|_| LendingError::MathOverflow.into())
}

pub fn debt_to_shares_ceil(debt: u64, index: u128) -> Result<u128> {
    require!(debt > 0 && index > 0, LendingError::AmountTooSmall);
    mul_div_ceil(u128::from(debt), RATE_SCALE, index)
}

pub fn shares_to_debt_ceil(shares: u128, index: u128) -> Result<u64> {
    let debt = mul_div_ceil(shares, index, RATE_SCALE)?;
    u64::try_from(debt).map_err(|_| LendingError::MathOverflow.into())
}

pub fn settle_rewards(
    shares: u128,
    checkpoint: u128,
    current_index: u128,
    already_owed: u64,
) -> Result<(u64, u128)> {
    let delta = current_index
        .checked_sub(checkpoint)
        .ok_or(LendingError::MathOverflow)?;
    let accrued = mul_div_floor(shares, delta, RATE_SCALE)?;
    let owed = u128::from(already_owed)
        .checked_add(accrued)
        .ok_or(LendingError::MathOverflow)?;
    Ok((
        u64::try_from(owed).map_err(|_| LendingError::MathOverflow)?,
        current_index,
    ))
}

pub fn collateral_value(
    collateral: u64,
    collateral_decimals: u8,
    price: u128,
    price_decimals: u8,
) -> Result<u64> {
    require!(
        collateral_decimals <= MAX_TOKEN_DECIMALS && price_decimals <= MAX_TOKEN_DECIMALS,
        LendingError::InvalidParameter
    );
    let token_scale = 10_u128
        .checked_pow(u32::from(collateral_decimals))
        .ok_or(LendingError::MathOverflow)?;
    let price_scale = 10_u128
        .checked_pow(u32::from(price_decimals))
        .ok_or(LendingError::MathOverflow)?;
    let value = mul_div_floor(
        u128::from(collateral),
        price,
        token_scale
            .checked_mul(price_scale)
            .ok_or(LendingError::MathOverflow)?,
    )?;
    u64::try_from(value).map_err(|_| LendingError::MathOverflow.into())
}

pub fn max_debt_for_collateral(value: u64, lltv_bps: u16) -> Result<u64> {
    let result = mul_div_floor(
        u128::from(value),
        u128::from(lltv_bps),
        u128::from(BPS_DENOMINATOR),
    )?;
    u64::try_from(result).map_err(|_| LendingError::MathOverflow.into())
}

pub fn liquidation_amounts(
    requested_repay: u64,
    debt: u64,
    collateral: u64,
    collateral_decimals: u8,
    price: u128,
    price_decimals: u8,
    close_factor_bps: u16,
    bonus_bps: u16,
) -> Result<(u64, u64)> {
    require!(
        requested_repay > 0 && debt > 0 && collateral > 0,
        LendingError::AmountTooSmall
    );
    let close_cap = mul_div_floor(
        u128::from(debt),
        u128::from(close_factor_bps),
        u128::from(BPS_DENOMINATOR),
    )?;
    let collateral_value =
        collateral_value(collateral, collateral_decimals, price, price_decimals)?;
    let repay_supported = mul_div_floor(
        u128::from(collateral_value),
        u128::from(BPS_DENOMINATOR),
        u128::from(BPS_DENOMINATOR + u64::from(bonus_bps)),
    )?;
    let repay = u128::from(requested_repay)
        .min(u128::from(debt))
        .min(close_cap.max(1))
        .min(repay_supported);
    require!(repay > 0, LendingError::AmountTooSmall);
    let seize_value = mul_div_ceil(
        repay,
        u128::from(BPS_DENOMINATOR + u64::from(bonus_bps)),
        u128::from(BPS_DENOMINATOR),
    )?;
    let token_scale = 10_u128
        .checked_pow(u32::from(collateral_decimals))
        .ok_or(LendingError::MathOverflow)?;
    let price_scale = 10_u128
        .checked_pow(u32::from(price_decimals))
        .ok_or(LendingError::MathOverflow)?;
    let seize = mul_div_ceil(
        seize_value,
        token_scale
            .checked_mul(price_scale)
            .ok_or(LendingError::MathOverflow)?,
        price,
    )?
    .min(u128::from(collateral));
    Ok((
        u64::try_from(repay).map_err(|_| LendingError::MathOverflow)?,
        u64::try_from(seize).map_err(|_| LendingError::MathOverflow)?,
    ))
}

pub fn liquidation_shares_to_burn(repaid: u64, debt: u64, borrow_shares: u128) -> Result<u128> {
    require!(
        repaid > 0 && debt > 0 && borrow_shares > 0,
        LendingError::AmountTooSmall
    );
    if repaid == debt {
        return Ok(borrow_shares);
    }
    let shares = mul_div_floor(u128::from(repaid), borrow_shares, u128::from(debt))?;
    require!(shares > 0, LendingError::AmountTooSmall);
    Ok(shares)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn utilization_is_bounded() {
        assert_eq!(utilization(100, 0).unwrap(), 0);
        assert_eq!(utilization(0, 100).unwrap(), RATE_SCALE);
        assert_eq!(utilization(50, 50).unwrap(), RATE_SCALE / 2);
    }

    #[test]
    fn piecewise_rate_reaches_expected_points() {
        let base = RATE_SCALE as u64 / 100;
        let low = RATE_SCALE as u64 * 4 / 100;
        let high = (RATE_SCALE / 100 * 95) as u64;
        assert_eq!(
            borrow_rate(0, base, 8_000, low, high, RATE_SCALE as u64).unwrap(),
            u128::from(base)
        );
        assert_eq!(
            borrow_rate(
                RATE_SCALE * 8 / 10,
                base,
                8_000,
                low,
                high,
                RATE_SCALE as u64
            )
            .unwrap(),
            u128::from(base + low)
        );
        assert_eq!(
            borrow_rate(RATE_SCALE, base, 8_000, low, high, RATE_SCALE as u64).unwrap(),
            RATE_SCALE
        );
    }

    #[test]
    fn debt_index_never_decreases() {
        let next = accrue_index(RATE_SCALE, RATE_SCALE / 10, SECONDS_PER_YEAR).unwrap();
        assert!(next >= RATE_SCALE + RATE_SCALE / 10);
    }

    #[test]
    fn checked_math_rejects_zero_divisor_and_overflow() {
        assert!(mul_div_floor(1, 1, 0).is_err());
        assert!(mul_div_floor(u128::MAX, 2, 1).is_err());
    }

    #[test]
    fn lender_share_rounding_never_overcredits() {
        assert_eq!(assets_to_shares(100, 0, 0).unwrap(), 100);
        assert_eq!(assets_to_shares(50, 101, 100).unwrap(), 49);
        assert_eq!(shares_to_assets(49, 101, 100).unwrap(), 49);
    }

    #[test]
    fn debt_rounds_against_the_borrower() {
        let index = RATE_SCALE + RATE_SCALE / 10;
        let shares = debt_to_shares_ceil(100, index).unwrap();
        assert!(shares_to_debt_ceil(shares, index).unwrap() >= 100);
    }

    #[test]
    fn lltv_is_a_strict_fraction_of_value() {
        assert_eq!(max_debt_for_collateral(1_000_000, 6_500).unwrap(), 650_000);
    }

    #[test]
    fn liquidation_respects_close_factor_and_collateral() {
        let price = 2_000_000_u128 * RATE_SCALE;
        let (repaid, seized) =
            liquidation_amounts(1_000_000, 1_000_000, 1_000_000, 6, price, 18, 5_000, 1_000)
                .unwrap();
        assert_eq!(repaid, 500_000);
        assert_eq!(seized, 275_000);
    }

    #[test]
    fn oracle_price_decimals_are_applied() {
        assert_eq!(
            collateral_value(1_000_000, 6, 2_000_000_000_000, 6).unwrap(),
            2_000_000
        );
        assert_eq!(
            collateral_value(1_000_000, 6, 2_000_000_000_000_000, 9).unwrap(),
            2_000_000
        );
    }

    #[test]
    fn partial_liquidation_never_burns_all_shares_for_partial_debt() {
        assert!(liquidation_shares_to_burn(1, 2, 1).is_err());
        assert_eq!(liquidation_shares_to_burn(1, 2, 2).unwrap(), 1);
        assert_eq!(liquidation_shares_to_burn(2, 2, 1).unwrap(), 1);
    }

    #[test]
    fn reward_checkpoint_prevents_historical_reward_theft() {
        let current = RATE_SCALE * 5;
        let (new_lender_owed, _) = settle_rewards(0, 0, current, 0).unwrap();
        assert_eq!(new_lender_owed, 0);
        let (existing_owed, checkpoint) = settle_rewards(10, RATE_SCALE * 4, current, 2).unwrap();
        assert_eq!(existing_owed, 12);
        assert_eq!(checkpoint, current);
        assert!(settle_rewards(1, current, current - 1, 0).is_err());
    }
}
