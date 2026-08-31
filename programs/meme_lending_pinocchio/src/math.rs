use solana_program_error::ProgramError;

use crate::constants::*;

pub type MathResult<T> = Result<T, ProgramError>;

#[inline(always)]
fn invalid() -> ProgramError {
    ProgramError::InvalidArgument
}

pub fn mul_div_floor(a: u128, b: u128, denominator: u128) -> MathResult<u128> {
    if denominator == 0 {
        return Err(invalid());
    }
    a.checked_mul(b)
        .and_then(|value| value.checked_div(denominator))
        .ok_or_else(invalid)
}

pub fn mul_div_ceil(a: u128, b: u128, denominator: u128) -> MathResult<u128> {
    if denominator == 0 {
        return Err(invalid());
    }
    a.checked_mul(b)
        .and_then(|value| value.checked_add(denominator - 1))
        .and_then(|value| value.checked_div(denominator))
        .ok_or_else(invalid)
}

pub fn utilization(cash: u64, debt: u128) -> MathResult<u128> {
    let assets = u128::from(cash).checked_add(debt).ok_or_else(invalid)?;
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
) -> MathResult<u128> {
    let target = mul_div_floor(
        u128::from(target_utilization_bps),
        RATE_SCALE,
        u128::from(BPS_DENOMINATOR),
    )?;
    if target == 0 || target >= RATE_SCALE {
        return Err(invalid());
    }
    let rate = if utilization <= target {
        u128::from(base_rate)
            .checked_add(mul_div_floor(u128::from(slope_low), utilization, target)?)
            .ok_or_else(invalid)?
    } else {
        let above = utilization.checked_sub(target).ok_or_else(invalid)?;
        let remaining = RATE_SCALE.checked_sub(target).ok_or_else(invalid)?;
        u128::from(base_rate)
            .checked_add(u128::from(slope_low))
            .and_then(|value| {
                value.checked_add(mul_div_floor(u128::from(slope_high), above, remaining).ok()?)
            })
            .ok_or_else(invalid)?
    };
    Ok(rate.min(u128::from(max_rate)))
}

pub fn accrue_index(index: u128, annual_rate: u128, elapsed_seconds: u64) -> MathResult<u128> {
    let growth = mul_div_ceil(
        annual_rate,
        u128::from(elapsed_seconds),
        u128::from(SECONDS_PER_YEAR),
    )?;
    let delta = mul_div_ceil(index, growth, RATE_SCALE)?;
    index.checked_add(delta).ok_or_else(invalid)
}

pub fn assets_to_shares(assets: u64, total_assets: u128, total_shares: u128) -> MathResult<u128> {
    if assets == 0 {
        return Err(invalid());
    }
    if total_shares == 0 {
        return Ok(u128::from(assets));
    }
    if total_assets == 0 {
        return Err(invalid());
    }
    let shares = mul_div_floor(u128::from(assets), total_shares, total_assets)?;
    (shares > 0).then_some(shares).ok_or_else(invalid)
}

pub fn shares_to_assets(shares: u128, total_assets: u128, total_shares: u128) -> MathResult<u64> {
    if shares == 0 || total_shares == 0 {
        return Err(invalid());
    }
    let assets = mul_div_floor(shares, total_assets, total_shares)?;
    if assets == 0 {
        return Err(invalid());
    }
    u64::try_from(assets).map_err(|_| invalid())
}

pub fn debt_to_shares_ceil(debt: u64, index: u128) -> MathResult<u128> {
    if debt == 0 || index == 0 {
        return Err(invalid());
    }
    mul_div_ceil(u128::from(debt), RATE_SCALE, index)
}

pub fn shares_to_debt_ceil(shares: u128, index: u128) -> MathResult<u64> {
    u64::try_from(mul_div_ceil(shares, index, RATE_SCALE)?).map_err(|_| invalid())
}

pub fn collateral_value(
    collateral: u64,
    collateral_decimals: u8,
    price: u128,
    price_decimals: u8,
) -> MathResult<u64> {
    if collateral_decimals > MAX_TOKEN_DECIMALS || price_decimals > MAX_TOKEN_DECIMALS {
        return Err(invalid());
    }
    let token_scale = 10_u128
        .checked_pow(u32::from(collateral_decimals))
        .ok_or_else(invalid)?;
    let price_scale = 10_u128
        .checked_pow(u32::from(price_decimals))
        .ok_or_else(invalid)?;
    let denominator = token_scale.checked_mul(price_scale).ok_or_else(invalid)?;
    u64::try_from(mul_div_floor(u128::from(collateral), price, denominator)?).map_err(|_| invalid())
}

pub fn max_debt_for_collateral(value: u64, lltv_bps: u16) -> MathResult<u64> {
    u64::try_from(mul_div_floor(
        u128::from(value),
        u128::from(lltv_bps),
        u128::from(BPS_DENOMINATOR),
    )?)
    .map_err(|_| invalid())
}

pub fn settle_rewards(
    shares: u128,
    checkpoint: u128,
    current_index: u128,
    already_owed: u64,
) -> MathResult<(u64, u128)> {
    let delta = current_index.checked_sub(checkpoint).ok_or_else(invalid)?;
    let accrued = mul_div_floor(shares, delta, RATE_SCALE)?;
    let owed = u128::from(already_owed)
        .checked_add(accrued)
        .ok_or_else(invalid)?;
    Ok((u64::try_from(owed).map_err(|_| invalid())?, current_index))
}

#[allow(clippy::too_many_arguments)]
pub fn liquidation_amounts(
    requested_repay: u64,
    debt: u64,
    collateral: u64,
    collateral_decimals: u8,
    price: u128,
    price_decimals: u8,
    close_factor_bps: u16,
    bonus_bps: u16,
) -> MathResult<(u64, u64)> {
    if requested_repay == 0 || debt == 0 || collateral == 0 || price == 0 {
        return Err(invalid());
    }
    let close_cap = mul_div_floor(
        u128::from(debt),
        u128::from(close_factor_bps),
        u128::from(BPS_DENOMINATOR),
    )?;
    let value = collateral_value(collateral, collateral_decimals, price, price_decimals)?;
    let repay_supported = mul_div_floor(
        u128::from(value),
        u128::from(BPS_DENOMINATOR),
        u128::from(BPS_DENOMINATOR + u64::from(bonus_bps)),
    )?;
    let repay = u128::from(requested_repay)
        .min(u128::from(debt))
        .min(close_cap.max(1))
        .min(repay_supported);
    if repay == 0 {
        return Err(invalid());
    }
    let seize_value = mul_div_ceil(
        repay,
        u128::from(BPS_DENOMINATOR + u64::from(bonus_bps)),
        u128::from(BPS_DENOMINATOR),
    )?;
    let token_scale = 10_u128
        .checked_pow(u32::from(collateral_decimals))
        .ok_or_else(invalid)?;
    let price_scale = 10_u128
        .checked_pow(u32::from(price_decimals))
        .ok_or_else(invalid)?;
    let seize = mul_div_ceil(
        seize_value,
        token_scale.checked_mul(price_scale).ok_or_else(invalid)?,
        price,
    )?
    .min(u128::from(collateral));
    Ok((
        u64::try_from(repay).map_err(|_| invalid())?,
        u64::try_from(seize).map_err(|_| invalid())?,
    ))
}

pub fn liquidation_shares_to_burn(repaid: u64, debt: u64, borrow_shares: u128) -> MathResult<u128> {
    if repaid == 0 || debt == 0 || borrow_shares == 0 || repaid > debt {
        return Err(invalid());
    }
    if repaid == debt {
        return Ok(borrow_shares);
    }
    let shares = mul_div_floor(u128::from(repaid), borrow_shares, u128::from(debt))?;
    (shares > 0).then_some(shares).ok_or_else(invalid)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_reference_rounding_vectors() {
        assert_eq!(utilization(50, 50).unwrap(), RATE_SCALE / 2);
        assert_eq!(assets_to_shares(50, 101, 100).unwrap(), 49);
        assert_eq!(shares_to_assets(49, 101, 100).unwrap(), 49);
        assert_eq!(max_debt_for_collateral(1_000_000, 6_500).unwrap(), 650_000);
        assert_eq!(liquidation_shares_to_burn(1, 2, 2).unwrap(), 1);
        assert_eq!(
            liquidation_amounts(
                1_000_000,
                1_000_000,
                1_000_000,
                6,
                2_000_000_u128 * RATE_SCALE,
                18,
                5_000,
                1_000,
            )
            .unwrap(),
            (500_000, 275_000)
        );
    }

    #[test]
    fn rates_and_rewards_match_reference_vectors() {
        let base = RATE_SCALE as u64 / 100;
        let low = RATE_SCALE as u64 * 4 / 100;
        let high = (RATE_SCALE / 100 * 95) as u64;
        assert_eq!(
            borrow_rate(0, base, 8_000, low, high, RATE_SCALE as u64).unwrap(),
            u128::from(base)
        );
        assert_eq!(
            borrow_rate(RATE_SCALE, base, 8_000, low, high, RATE_SCALE as u64).unwrap(),
            RATE_SCALE
        );
        assert!(
            accrue_index(RATE_SCALE, RATE_SCALE / 10, SECONDS_PER_YEAR).unwrap()
                >= RATE_SCALE + RATE_SCALE / 10
        );
        assert_eq!(
            settle_rewards(10, RATE_SCALE * 4, RATE_SCALE * 5, 2).unwrap(),
            (12, RATE_SCALE * 5)
        );
    }

    #[test]
    fn oracle_decimal_vectors_match_reference() {
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
    fn checked_math_rejects_invalid_values() {
        assert!(mul_div_floor(1, 1, 0).is_err());
        assert!(mul_div_floor(u128::MAX, 2, 1).is_err());
        assert!(liquidation_shares_to_burn(2, 1, 1).is_err());
    }
}
