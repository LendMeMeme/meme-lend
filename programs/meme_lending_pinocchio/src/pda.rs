use pinocchio::{error::ProgramError, Address};

pub const GLOBAL_CONFIG_SEED: &[u8] = b"global-config";
pub const MARKET_SEED: &[u8] = b"market";
pub const MARKET_AUTHORITY_SEED: &[u8] = b"market-authority";
pub const ORACLE_CONFIG_SEED: &[u8] = b"oracle-config";
pub const ORACLE_OBSERVATION_SEED: &[u8] = b"oracle-observation";
pub const LENDER_POSITION_SEED: &[u8] = b"lender-position";
pub const BORROWER_POSITION_SEED: &[u8] = b"borrower-position";
pub const REWARDS_SEED: &[u8] = b"market-rewards";
pub const RESERVE_SEED: &[u8] = b"first-loss-reserve";
pub const RESERVE_VAULT_SEED: &[u8] = b"reserve-vault";
pub const ASSOCIATED_TOKEN_PROGRAM: Address =
    Address::from_str_const("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

/// Hot-path PDA verification. Bumps are found and validated during account
/// creation, then persisted; SHA-256 derivation avoids the 1,500-CU curve check.
#[inline(always)]
pub fn verify<const N: usize>(
    actual: &Address,
    seeds: &[&[u8]; N],
    bump: u8,
    program_id: &Address,
) -> Result<(), ProgramError> {
    (Address::derive_address(seeds, Some(bump), program_id) == *actual)
        .then_some(())
        .ok_or(ProgramError::InvalidSeeds)
}

/// Creation-time canonical verification. This is intentionally more expensive
/// and ensures the persisted bump is canonical before hot paths trust it.
pub fn verify_canonical<const N: usize>(
    actual: &Address,
    seeds: &[&[u8]; N],
    bump: u8,
    program_id: &Address,
) -> Result<(), ProgramError> {
    let (expected, canonical_bump) =
        Address::derive_program_address(seeds, program_id).ok_or(ProgramError::InvalidSeeds)?;
    (expected == *actual && canonical_bump == bump)
        .then_some(())
        .ok_or(ProgramError::InvalidSeeds)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fast_derivation_matches_canonical_address() {
        let program_id = Address::new_from_array([7; 32]);
        let market = Address::new_from_array([8; 32]);
        let seeds = [MARKET_AUTHORITY_SEED, market.as_ref()];
        let (address, bump) = Address::derive_program_address(&seeds, &program_id).unwrap();
        assert!(verify(&address, &seeds, bump, &program_id).is_ok());
        assert!(verify_canonical(&address, &seeds, bump, &program_id).is_ok());
        assert!(verify(&address, &seeds, bump.wrapping_sub(1), &program_id).is_err());
    }
}
