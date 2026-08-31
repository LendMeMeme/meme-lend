use solana_program_error::ProgramError;

use crate::codec::{Decoder, Encoder};

pub const STATE_VERSION: u8 = 1;
pub const ADDRESS_BYTES: usize = 32;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum AccountKind {
    GlobalConfig = 1,
    Market = 2,
    OracleConfiguration = 3,
    OracleObservation = 4,
    LenderPosition = 5,
    BorrowerPosition = 6,
    MarketRewards = 7,
    FirstLossReserve = 8,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct AccountHeader {
    pub version: u8,
    pub kind: AccountKind,
    pub bump: u8,
}

impl AccountHeader {
    pub const LEN: usize = 3;

    fn decode(decoder: &mut Decoder<'_>, expected: AccountKind) -> Result<Self, ProgramError> {
        let version = decoder.u8()?;
        let kind = match decoder.u8()? {
            1 => AccountKind::GlobalConfig,
            2 => AccountKind::Market,
            3 => AccountKind::OracleConfiguration,
            4 => AccountKind::OracleObservation,
            5 => AccountKind::LenderPosition,
            6 => AccountKind::BorrowerPosition,
            7 => AccountKind::MarketRewards,
            8 => AccountKind::FirstLossReserve,
            _ => return Err(ProgramError::InvalidAccountData),
        };
        let bump = decoder.u8()?;
        if version != STATE_VERSION || kind != expected {
            return Err(ProgramError::InvalidAccountData);
        }
        Ok(Self {
            version,
            kind,
            bump,
        })
    }

    fn encode(&self, encoder: &mut Encoder<'_>) -> Result<(), ProgramError> {
        encoder.put(&[self.version, self.kind as u8, self.bump])
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct BorrowerPosition {
    pub header: AccountHeader,
    pub market: [u8; ADDRESS_BYTES],
    pub owner: [u8; ADDRESS_BYTES],
    pub collateral_amount: u64,
    pub borrow_shares: u128,
}

impl BorrowerPosition {
    pub const LEN: usize = AccountHeader::LEN + ADDRESS_BYTES * 2 + 8 + 16;

    pub fn decode(data: &[u8]) -> Result<Self, ProgramError> {
        if data.len() != Self::LEN {
            return Err(ProgramError::InvalidAccountData);
        }
        let mut decoder = Decoder::new(data);
        let value = Self {
            header: AccountHeader::decode(&mut decoder, AccountKind::BorrowerPosition)?,
            market: *decoder.take()?,
            owner: *decoder.take()?,
            collateral_amount: decoder.u64()?,
            borrow_shares: decoder.u128()?,
        };
        decoder.finish()?;
        Ok(value)
    }

    pub fn encode(&self, data: &mut [u8]) -> Result<(), ProgramError> {
        if data.len() != Self::LEN {
            return Err(ProgramError::AccountDataTooSmall);
        }
        let mut encoder = Encoder::new(data);
        self.header.encode(&mut encoder)?;
        encoder.put(&self.market)?;
        encoder.put(&self.owner)?;
        encoder.put(&self.collateral_amount.to_le_bytes())?;
        encoder.put(&self.borrow_shares.to_le_bytes())?;
        encoder.finish()
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct LenderPosition {
    pub header: AccountHeader,
    pub market: [u8; ADDRESS_BYTES],
    pub owner: [u8; ADDRESS_BYTES],
    pub supply_shares: u128,
    pub reward_index_checkpoint: u128,
    pub reward_owed: u64,
}

impl LenderPosition {
    pub const LEN: usize = AccountHeader::LEN + ADDRESS_BYTES * 2 + 16 + 16 + 8;

    pub fn decode(data: &[u8]) -> Result<Self, ProgramError> {
        if data.len() != Self::LEN {
            return Err(ProgramError::InvalidAccountData);
        }
        let mut decoder = Decoder::new(data);
        let value = Self {
            header: AccountHeader::decode(&mut decoder, AccountKind::LenderPosition)?,
            market: *decoder.take()?,
            owner: *decoder.take()?,
            supply_shares: decoder.u128()?,
            reward_index_checkpoint: decoder.u128()?,
            reward_owed: decoder.u64()?,
        };
        decoder.finish()?;
        Ok(value)
    }

    pub fn encode(&self, data: &mut [u8]) -> Result<(), ProgramError> {
        if data.len() != Self::LEN {
            return Err(ProgramError::AccountDataTooSmall);
        }
        let mut encoder = Encoder::new(data);
        self.header.encode(&mut encoder)?;
        encoder.put(&self.market)?;
        encoder.put(&self.owner)?;
        encoder.put(&self.supply_shares.to_le_bytes())?;
        encoder.put(&self.reward_index_checkpoint.to_le_bytes())?;
        encoder.put(&self.reward_owed.to_le_bytes())?;
        encoder.finish()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn header(kind: AccountKind) -> AccountHeader {
        AccountHeader {
            version: STATE_VERSION,
            kind,
            bump: 254,
        }
    }

    #[test]
    fn borrower_position_round_trips_without_padding() {
        let position = BorrowerPosition {
            header: header(AccountKind::BorrowerPosition),
            market: [1; 32],
            owner: [2; 32],
            collateral_amount: 42,
            borrow_shares: 99,
        };
        let mut bytes = [0_u8; BorrowerPosition::LEN];
        position.encode(&mut bytes).unwrap();
        assert_eq!(BorrowerPosition::decode(&bytes).unwrap(), position);
        assert_eq!(BorrowerPosition::LEN, 91);
    }

    #[test]
    fn lender_position_round_trips_without_padding() {
        let position = LenderPosition {
            header: header(AccountKind::LenderPosition),
            market: [1; 32],
            owner: [2; 32],
            supply_shares: 11,
            reward_index_checkpoint: 12,
            reward_owed: 13,
        };
        let mut bytes = [0_u8; LenderPosition::LEN];
        position.encode(&mut bytes).unwrap();
        assert_eq!(LenderPosition::decode(&bytes).unwrap(), position);
        assert_eq!(LenderPosition::LEN, 107);
    }

    #[test]
    fn account_kind_confusion_is_rejected() {
        let position = BorrowerPosition {
            header: header(AccountKind::BorrowerPosition),
            market: [1; 32],
            owner: [2; 32],
            collateral_amount: 42,
            borrow_shares: 99,
        };
        let mut bytes = [0_u8; BorrowerPosition::LEN];
        position.encode(&mut bytes).unwrap();
        bytes[1] = AccountKind::LenderPosition as u8;
        assert!(BorrowerPosition::decode(&bytes).is_err());
    }
}
