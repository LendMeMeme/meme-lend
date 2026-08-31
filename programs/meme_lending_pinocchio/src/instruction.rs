use solana_program_error::ProgramError;

/// Stable optimized-program instruction tags. These do not reuse Anchor's
/// discriminators: the optimized deployment has its own program id and SDK.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum LendingInstruction {
    InitializeProtocol = 0,
    CreateMarket = 1,
    SetProtocolPause = 2,
    PauseMarket = 3,
    AccrueInterest = 4,
    SupplyUsdc = 5,
    WithdrawUsdc = 6,
    SubmitOracleObservation = 7,
    DepositCollateral = 8,
    WithdrawCollateral = 9,
    BorrowUsdc = 10,
    RepayUsdc = 11,
    DepositFirstLossReserve = 12,
    ClaimMarketCreatorFees = 13,
    ClaimProtocolFees = 14,
    Liquidate = 15,
    FundLenderRewards = 16,
    ClaimLenderRewards = 17,
}

impl LendingInstruction {
    pub fn decode(data: &[u8]) -> Result<Self, ProgramError> {
        let tag = *data.first().ok_or(ProgramError::InvalidInstructionData)?;
        match tag {
            0 => Ok(Self::InitializeProtocol),
            1 => Ok(Self::CreateMarket),
            2 => Ok(Self::SetProtocolPause),
            3 => Ok(Self::PauseMarket),
            4 => Ok(Self::AccrueInterest),
            5 => Ok(Self::SupplyUsdc),
            6 => Ok(Self::WithdrawUsdc),
            7 => Ok(Self::SubmitOracleObservation),
            8 => Ok(Self::DepositCollateral),
            9 => Ok(Self::WithdrawCollateral),
            10 => Ok(Self::BorrowUsdc),
            11 => Ok(Self::RepayUsdc),
            12 => Ok(Self::DepositFirstLossReserve),
            13 => Ok(Self::ClaimMarketCreatorFees),
            14 => Ok(Self::ClaimProtocolFees),
            15 => Ok(Self::Liquidate),
            16 => Ok(Self::FundLenderRewards),
            17 => Ok(Self::ClaimLenderRewards),
            _ => Err(ProgramError::InvalidInstructionData),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_missing_and_unknown_tags() {
        assert!(LendingInstruction::decode(&[]).is_err());
        assert!(LendingInstruction::decode(&[18]).is_err());
    }

    #[test]
    fn all_public_instruction_tags_are_stable() {
        for tag in 0..=17 {
            assert_eq!(LendingInstruction::decode(&[tag]).unwrap() as u8, tag);
        }
    }
}
