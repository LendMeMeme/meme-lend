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
