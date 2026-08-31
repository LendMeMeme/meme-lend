use pinocchio::error::ProgramError;

use crate::codec::{Decoder, Encoder};

pub const STATE_VERSION: u8 = 1;
pub const ADDRESS_BYTES: usize = 32;
pub const MARKET_FLAG_BORROWING_PAUSED: u8 = 1;
pub const MARKET_FLAG_REWARDS_ENABLED: u8 = 2;
pub const TOKEN_FLAG_COLLATERAL_2022: u8 = 1;
pub const TOKEN_FLAG_LOAN_2022: u8 = 2;
pub const GLOBAL_FLAG_PAUSED: u8 = 1;
pub const ORACLE_FLAG_CUSTOM_HIGH_RISK: u8 = 1;

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
pub struct GlobalConfig {
    pub header: AccountHeader,
    pub authority: [u8; ADDRESS_BYTES],
    pub pending_authority: [u8; ADDRESS_BYTES],
    pub approved_loan_mint: [u8; ADDRESS_BYTES],
    pub protocol_fee_recipient: [u8; ADDRESS_BYTES],
    pub market_count: u64,
    pub max_oracle_age_seconds: u32,
    pub flags: u8,
}

impl GlobalConfig {
    pub const LEN: usize = AccountHeader::LEN + ADDRESS_BYTES * 4 + 8 + 4 + 1;

    pub fn decode(data: &[u8]) -> Result<Self, ProgramError> {
        if data.len() != Self::LEN {
            return Err(ProgramError::InvalidAccountData);
        }
        let mut decoder = Decoder::new(data);
        let value = Self {
            header: AccountHeader::decode(&mut decoder, AccountKind::GlobalConfig)?,
            authority: *decoder.take()?,
            pending_authority: *decoder.take()?,
            approved_loan_mint: *decoder.take()?,
            protocol_fee_recipient: *decoder.take()?,
            market_count: decoder.u64()?,
            max_oracle_age_seconds: decoder.u32()?,
            flags: decoder.u8()?,
        };
        decoder.finish()?;
        if value.flags & !GLOBAL_FLAG_PAUSED != 0 {
            return Err(ProgramError::InvalidAccountData);
        }
        Ok(value)
    }

    pub fn encode(&self, data: &mut [u8]) -> Result<(), ProgramError> {
        if data.len() != Self::LEN {
            return Err(ProgramError::AccountDataTooSmall);
        }
        let mut encoder = Encoder::new(data);
        self.header.encode(&mut encoder)?;
        encoder.put(&self.authority)?;
        encoder.put(&self.pending_authority)?;
        encoder.put(&self.approved_loan_mint)?;
        encoder.put(&self.protocol_fee_recipient)?;
        encoder.u64(self.market_count)?;
        encoder.u32(self.max_oracle_age_seconds)?;
        encoder.u8(self.flags)?;
        encoder.finish()
    }

    pub const fn paused(&self) -> bool {
        self.flags & GLOBAL_FLAG_PAUSED != 0
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum OracleKind {
    Pyth = 0,
    Switchboard = 1,
    DexTwap = 2,
    AggregatedPools = 3,
    Custom = 4,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct OracleConfiguration {
    pub header: AccountHeader,
    pub market: [u8; ADDRESS_BYTES],
    pub kind: OracleKind,
    pub max_age_seconds: u32,
    pub max_confidence_bps: u16,
    pub max_deviation_bps: u16,
    pub price_decimals: u8,
    pub source_count: u8,
    pub sources: [[u8; ADDRESS_BYTES]; 5],
    pub flags: u8,
}

impl OracleConfiguration {
    pub const LEN: usize = AccountHeader::LEN + ADDRESS_BYTES + 1 + 4 + 2 + 2 + 1 + 1 + 160 + 1;

    pub fn decode(data: &[u8]) -> Result<Self, ProgramError> {
        if data.len() != Self::LEN {
            return Err(ProgramError::InvalidAccountData);
        }
        let mut decoder = Decoder::new(data);
        let header = AccountHeader::decode(&mut decoder, AccountKind::OracleConfiguration)?;
        let market = *decoder.take()?;
        let kind = match decoder.u8()? {
            0 => OracleKind::Pyth,
            1 => OracleKind::Switchboard,
            2 => OracleKind::DexTwap,
            3 => OracleKind::AggregatedPools,
            4 => OracleKind::Custom,
            _ => return Err(ProgramError::InvalidAccountData),
        };
        let value = Self {
            header,
            market,
            kind,
            max_age_seconds: decoder.u32()?,
            max_confidence_bps: decoder.u16()?,
            max_deviation_bps: decoder.u16()?,
            price_decimals: decoder.u8()?,
            source_count: decoder.u8()?,
            sources: [
                *decoder.take()?,
                *decoder.take()?,
                *decoder.take()?,
                *decoder.take()?,
                *decoder.take()?,
            ],
            flags: decoder.u8()?,
        };
        decoder.finish()?;
        if value.source_count == 0
            || value.source_count > 5
            || value.flags & !ORACLE_FLAG_CUSTOM_HIGH_RISK != 0
        {
            return Err(ProgramError::InvalidAccountData);
        }
        Ok(value)
    }

    pub fn encode(&self, data: &mut [u8]) -> Result<(), ProgramError> {
        if data.len() != Self::LEN || self.source_count == 0 || self.source_count > 5 {
            return Err(ProgramError::InvalidAccountData);
        }
        let mut encoder = Encoder::new(data);
        self.header.encode(&mut encoder)?;
        encoder.put(&self.market)?;
        encoder.u8(self.kind as u8)?;
        encoder.u32(self.max_age_seconds)?;
        encoder.u16(self.max_confidence_bps)?;
        encoder.u16(self.max_deviation_bps)?;
        encoder.u8(self.price_decimals)?;
        encoder.u8(self.source_count)?;
        for source in &self.sources {
            encoder.put(source)?;
        }
        encoder.u8(self.flags)?;
        encoder.finish()
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct MarketRewards {
    pub header: AccountHeader,
    pub vault_bump: u8,
    pub market: [u8; ADDRESS_BYTES],
    pub reward_mint: [u8; ADDRESS_BYTES],
    pub reward_index: u128,
    pub undistributed_rewards: u64,
}

impl MarketRewards {
    pub const LEN: usize = AccountHeader::LEN + 1 + ADDRESS_BYTES * 2 + 16 + 8;

    pub fn decode(data: &[u8]) -> Result<Self, ProgramError> {
        if data.len() != Self::LEN {
            return Err(ProgramError::InvalidAccountData);
        }
        let mut decoder = Decoder::new(data);
        let value = Self {
            header: AccountHeader::decode(&mut decoder, AccountKind::MarketRewards)?,
            vault_bump: decoder.u8()?,
            market: *decoder.take()?,
            reward_mint: *decoder.take()?,
            reward_index: decoder.u128()?,
            undistributed_rewards: decoder.u64()?,
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
        encoder.u8(self.vault_bump)?;
        encoder.put(&self.market)?;
        encoder.put(&self.reward_mint)?;
        encoder.u128(self.reward_index)?;
        encoder.u64(self.undistributed_rewards)?;
        encoder.finish()
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct FirstLossReserve {
    pub header: AccountHeader,
    pub market: [u8; ADDRESS_BYTES],
    pub deposited: u64,
    pub absorbed_losses: u64,
}

impl FirstLossReserve {
    pub const LEN: usize = AccountHeader::LEN + ADDRESS_BYTES + 8 + 8;

    pub fn decode(data: &[u8]) -> Result<Self, ProgramError> {
        if data.len() != Self::LEN {
            return Err(ProgramError::InvalidAccountData);
        }
        let mut decoder = Decoder::new(data);
        let value = Self {
            header: AccountHeader::decode(&mut decoder, AccountKind::FirstLossReserve)?,
            market: *decoder.take()?,
            deposited: decoder.u64()?,
            absorbed_losses: decoder.u64()?,
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
        encoder.u64(self.deposited)?;
        encoder.u64(self.absorbed_losses)?;
        encoder.finish()
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Market {
    pub header: AccountHeader,
    pub authority_bump: u8,
    pub vault_bumps: [u8; 3],
    pub creator: [u8; ADDRESS_BYTES],
    pub collateral_mint: [u8; ADDRESS_BYTES],
    pub loan_mint: [u8; ADDRESS_BYTES],
    pub config_hash: [u8; 32],
    pub lltv_bps: u16,
    pub liquidation_bonus_bps: u16,
    pub close_factor_bps: u16,
    pub creator_fee_bps: u16,
    pub protocol_fee_bps: u16,
    /// Approved immutable curve identifier; full coefficients are compile-time constants.
    pub rate_model_id: u8,
    pub flags: u8,
    /// Two bits replace two 32-byte token-program addresses.
    pub token_program_flags: u8,
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
}

impl Market {
    pub const LEN: usize = AccountHeader::LEN + 4 + ADDRESS_BYTES * 4 + 10 + 3 + 16 + 64 + 32;

    pub fn decode(data: &[u8]) -> Result<Self, ProgramError> {
        if data.len() != Self::LEN {
            return Err(ProgramError::InvalidAccountData);
        }
        let mut decoder = Decoder::new(data);
        let value = Self {
            header: AccountHeader::decode(&mut decoder, AccountKind::Market)?,
            authority_bump: decoder.u8()?,
            vault_bumps: *decoder.take()?,
            creator: *decoder.take()?,
            collateral_mint: *decoder.take()?,
            loan_mint: *decoder.take()?,
            config_hash: *decoder.take()?,
            lltv_bps: decoder.u16()?,
            liquidation_bonus_bps: decoder.u16()?,
            close_factor_bps: decoder.u16()?,
            creator_fee_bps: decoder.u16()?,
            protocol_fee_bps: decoder.u16()?,
            rate_model_id: decoder.u8()?,
            flags: decoder.u8()?,
            token_program_flags: decoder.u8()?,
            market_borrow_cap: decoder.u64()?,
            wallet_borrow_cap: decoder.u64()?,
            total_supply_shares: decoder.u128()?,
            total_borrow_shares: decoder.u128()?,
            borrow_index: decoder.u128()?,
            total_debt: decoder.u128()?,
            bad_debt: decoder.u64()?,
            creator_fees_claimable: decoder.u64()?,
            protocol_fees_claimable: decoder.u64()?,
            last_accrual_timestamp: decoder.i64()?,
        };
        decoder.finish()?;
        if value.rate_model_id > 1
            || value.flags & !(MARKET_FLAG_BORROWING_PAUSED | MARKET_FLAG_REWARDS_ENABLED) != 0
        {
            return Err(ProgramError::InvalidAccountData);
        }
        if value.token_program_flags & !(TOKEN_FLAG_COLLATERAL_2022 | TOKEN_FLAG_LOAN_2022) != 0 {
            return Err(ProgramError::InvalidAccountData);
        }
        Ok(value)
    }

    pub fn encode(&self, data: &mut [u8]) -> Result<(), ProgramError> {
        if data.len() != Self::LEN {
            return Err(ProgramError::AccountDataTooSmall);
        }
        let mut encoder = Encoder::new(data);
        self.header.encode(&mut encoder)?;
        encoder.u8(self.authority_bump)?;
        encoder.put(&self.vault_bumps)?;
        encoder.put(&self.creator)?;
        encoder.put(&self.collateral_mint)?;
        encoder.put(&self.loan_mint)?;
        encoder.put(&self.config_hash)?;
        encoder.u16(self.lltv_bps)?;
        encoder.u16(self.liquidation_bonus_bps)?;
        encoder.u16(self.close_factor_bps)?;
        encoder.u16(self.creator_fee_bps)?;
        encoder.u16(self.protocol_fee_bps)?;
        encoder.u8(self.rate_model_id)?;
        encoder.u8(self.flags)?;
        encoder.u8(self.token_program_flags)?;
        encoder.u64(self.market_borrow_cap)?;
        encoder.u64(self.wallet_borrow_cap)?;
        encoder.u128(self.total_supply_shares)?;
        encoder.u128(self.total_borrow_shares)?;
        encoder.u128(self.borrow_index)?;
        encoder.u128(self.total_debt)?;
        encoder.u64(self.bad_debt)?;
        encoder.u64(self.creator_fees_claimable)?;
        encoder.u64(self.protocol_fees_claimable)?;
        encoder.i64(self.last_accrual_timestamp)?;
        encoder.finish()
    }

    #[inline(always)]
    pub const fn borrowing_paused(&self) -> bool {
        self.flags & MARKET_FLAG_BORROWING_PAUSED != 0
    }
}

/// In-place access to frequently mutated market totals. This avoids decoding and
/// re-encoding the 257-byte market on every supply, borrow, repay, or liquidation.
pub struct MarketMut<'a> {
    data: &'a mut [u8],
}

impl<'a> MarketMut<'a> {
    const FLAGS_OFFSET: usize = 146;
    const TOTAL_SUPPLY_SHARES_OFFSET: usize = 164;
    const TOTAL_BORROW_SHARES_OFFSET: usize = 180;
    const BORROW_INDEX_OFFSET: usize = 196;
    const TOTAL_DEBT_OFFSET: usize = 212;
    const LAST_ACCRUAL_OFFSET: usize = 252;

    pub fn new(data: &'a mut [u8]) -> Result<Self, ProgramError> {
        if data.len() != Market::LEN
            || data[0] != STATE_VERSION
            || data[1] != AccountKind::Market as u8
            || data[Self::FLAGS_OFFSET]
                & !(MARKET_FLAG_BORROWING_PAUSED | MARKET_FLAG_REWARDS_ENABLED)
                != 0
        {
            return Err(ProgramError::InvalidAccountData);
        }
        Ok(Self { data })
    }

    #[inline(always)]
    fn read_u128(&self, offset: usize) -> u128 {
        u128::from_le_bytes(self.data[offset..offset + 16].try_into().unwrap())
    }

    #[inline(always)]
    fn write_u128(&mut self, offset: usize, value: u128) {
        self.data[offset..offset + 16].copy_from_slice(&value.to_le_bytes());
    }

    pub fn total_supply_shares(&self) -> u128 {
        self.read_u128(Self::TOTAL_SUPPLY_SHARES_OFFSET)
    }

    pub fn set_total_supply_shares(&mut self, value: u128) {
        self.write_u128(Self::TOTAL_SUPPLY_SHARES_OFFSET, value);
    }

    pub fn total_borrow_shares(&self) -> u128 {
        self.read_u128(Self::TOTAL_BORROW_SHARES_OFFSET)
    }

    pub fn set_total_borrow_shares(&mut self, value: u128) {
        self.write_u128(Self::TOTAL_BORROW_SHARES_OFFSET, value);
    }

    pub fn borrow_index(&self) -> u128 {
        self.read_u128(Self::BORROW_INDEX_OFFSET)
    }

    pub fn set_borrow_index(&mut self, value: u128) {
        self.write_u128(Self::BORROW_INDEX_OFFSET, value);
    }

    pub fn total_debt(&self) -> u128 {
        self.read_u128(Self::TOTAL_DEBT_OFFSET)
    }

    pub fn set_total_debt(&mut self, value: u128) {
        self.write_u128(Self::TOTAL_DEBT_OFFSET, value);
    }

    pub fn set_last_accrual_timestamp(&mut self, value: i64) {
        self.data[Self::LAST_ACCRUAL_OFFSET..Self::LAST_ACCRUAL_OFFSET + 8]
            .copy_from_slice(&value.to_le_bytes());
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct OracleObservation {
    pub header: AccountHeader,
    pub market: [u8; ADDRESS_BYTES],
    pub publisher: [u8; ADDRESS_BYTES],
    pub price: u128,
    pub confidence_bps: u16,
    pub deviation_bps: u16,
    pub max_recoverable_usdc: u64,
    pub published_at: i64,
    pub sequence: u64,
}

impl OracleObservation {
    pub const LEN: usize = AccountHeader::LEN + ADDRESS_BYTES * 2 + 16 + 4 + 24;

    pub fn decode(data: &[u8]) -> Result<Self, ProgramError> {
        if data.len() != Self::LEN {
            return Err(ProgramError::InvalidAccountData);
        }
        let mut decoder = Decoder::new(data);
        let value = Self {
            header: AccountHeader::decode(&mut decoder, AccountKind::OracleObservation)?,
            market: *decoder.take()?,
            publisher: *decoder.take()?,
            price: decoder.u128()?,
            confidence_bps: decoder.u16()?,
            deviation_bps: decoder.u16()?,
            max_recoverable_usdc: decoder.u64()?,
            published_at: decoder.i64()?,
            sequence: decoder.u64()?,
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
        encoder.put(&self.publisher)?;
        encoder.u128(self.price)?;
        encoder.u16(self.confidence_bps)?;
        encoder.u16(self.deviation_bps)?;
        encoder.u64(self.max_recoverable_usdc)?;
        encoder.i64(self.published_at)?;
        encoder.u64(self.sequence)?;
        encoder.finish()
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

    #[test]
    fn market_round_trips_in_260_bytes() {
        let market = Market {
            header: header(AccountKind::Market),
            authority_bump: 253,
            vault_bumps: [250, 251, 252],
            creator: [1; 32],
            collateral_mint: [2; 32],
            loan_mint: [3; 32],
            config_hash: [4; 32],
            lltv_bps: 6_500,
            liquidation_bonus_bps: 1_000,
            close_factor_bps: 5_000,
            creator_fee_bps: 100,
            protocol_fee_bps: 100,
            rate_model_id: 1,
            flags: MARKET_FLAG_BORROWING_PAUSED,
            token_program_flags: TOKEN_FLAG_COLLATERAL_2022,
            market_borrow_cap: 1_000_000,
            wallet_borrow_cap: 100_000,
            total_supply_shares: 10,
            total_borrow_shares: 11,
            borrow_index: 12,
            total_debt: 13,
            bad_debt: 14,
            creator_fees_claimable: 15,
            protocol_fees_claimable: 16,
            last_accrual_timestamp: 17,
        };
        let mut bytes = [0_u8; Market::LEN];
        market.encode(&mut bytes).unwrap();
        assert_eq!(Market::decode(&bytes).unwrap(), market);
        assert!(Market::decode(&bytes).unwrap().borrowing_paused());
        assert_eq!(Market::LEN, 260);
    }

    #[test]
    fn market_rejects_unknown_packed_flags() {
        let mut bytes = [0_u8; Market::LEN];
        let market = Market {
            header: header(AccountKind::Market),
            authority_bump: 1,
            vault_bumps: [2, 3, 4],
            creator: [0; 32],
            collateral_mint: [0; 32],
            loan_mint: [0; 32],
            config_hash: [0; 32],
            lltv_bps: 5_000,
            liquidation_bonus_bps: 1,
            close_factor_bps: 5_000,
            creator_fee_bps: 0,
            protocol_fee_bps: 0,
            rate_model_id: 0,
            flags: 4,
            token_program_flags: 0,
            market_borrow_cap: 1,
            wallet_borrow_cap: 1,
            total_supply_shares: 0,
            total_borrow_shares: 0,
            borrow_index: 1,
            total_debt: 0,
            bad_debt: 0,
            creator_fees_claimable: 0,
            protocol_fees_claimable: 0,
            last_accrual_timestamp: 0,
        };
        market.encode(&mut bytes).unwrap();
        assert!(Market::decode(&bytes).is_err());
    }

    #[test]
    fn oracle_observation_round_trips_in_111_bytes() {
        let observation = OracleObservation {
            header: header(AccountKind::OracleObservation),
            market: [1; 32],
            publisher: [2; 32],
            price: 3,
            confidence_bps: 4,
            deviation_bps: 5,
            max_recoverable_usdc: 6,
            published_at: 7,
            sequence: 8,
        };
        let mut bytes = [0_u8; OracleObservation::LEN];
        observation.encode(&mut bytes).unwrap();
        assert_eq!(OracleObservation::decode(&bytes).unwrap(), observation);
        assert_eq!(OracleObservation::LEN, 111);
    }

    #[test]
    fn hot_market_totals_mutate_in_place() {
        let market = Market {
            header: header(AccountKind::Market),
            authority_bump: 1,
            vault_bumps: [2, 3, 4],
            creator: [0; 32],
            collateral_mint: [0; 32],
            loan_mint: [0; 32],
            config_hash: [0; 32],
            lltv_bps: 5_000,
            liquidation_bonus_bps: 1,
            close_factor_bps: 5_000,
            creator_fee_bps: 0,
            protocol_fee_bps: 0,
            rate_model_id: 0,
            flags: 0,
            token_program_flags: 0,
            market_borrow_cap: 1,
            wallet_borrow_cap: 1,
            total_supply_shares: 2,
            total_borrow_shares: 3,
            borrow_index: 4,
            total_debt: 5,
            bad_debt: 0,
            creator_fees_claimable: 0,
            protocol_fees_claimable: 0,
            last_accrual_timestamp: 6,
        };
        let mut bytes = [0_u8; Market::LEN];
        market.encode(&mut bytes).unwrap();
        let mut view = MarketMut::new(&mut bytes).unwrap();
        assert_eq!(view.total_supply_shares(), 2);
        assert_eq!(view.total_borrow_shares(), 3);
        assert_eq!(view.borrow_index(), 4);
        assert_eq!(view.total_debt(), 5);
        view.set_total_supply_shares(20);
        view.set_total_borrow_shares(30);
        view.set_borrow_index(40);
        view.set_total_debt(50);
        view.set_last_accrual_timestamp(60);
        let decoded = Market::decode(&bytes).unwrap();
        assert_eq!(decoded.total_supply_shares, 20);
        assert_eq!(decoded.total_borrow_shares, 30);
        assert_eq!(decoded.borrow_index, 40);
        assert_eq!(decoded.total_debt, 50);
        assert_eq!(decoded.last_accrual_timestamp, 60);
    }

    #[test]
    fn global_config_round_trips_in_144_bytes() {
        let config = GlobalConfig {
            header: header(AccountKind::GlobalConfig),
            authority: [1; 32],
            pending_authority: [2; 32],
            approved_loan_mint: [3; 32],
            protocol_fee_recipient: [4; 32],
            market_count: 5,
            max_oracle_age_seconds: 60,
            flags: GLOBAL_FLAG_PAUSED,
        };
        let mut bytes = [0_u8; GlobalConfig::LEN];
        config.encode(&mut bytes).unwrap();
        assert_eq!(GlobalConfig::decode(&bytes).unwrap(), config);
        assert!(GlobalConfig::decode(&bytes).unwrap().paused());
        assert_eq!(GlobalConfig::LEN, 144);
    }

    #[test]
    fn oracle_configuration_is_fixed_and_bounded() {
        let config = OracleConfiguration {
            header: header(AccountKind::OracleConfiguration),
            market: [1; 32],
            kind: OracleKind::Custom,
            max_age_seconds: 60,
            max_confidence_bps: 100,
            max_deviation_bps: 200,
            price_decimals: 8,
            source_count: 1,
            sources: [[2; 32], [0; 32], [0; 32], [0; 32], [0; 32]],
            flags: ORACLE_FLAG_CUSTOM_HIGH_RISK,
        };
        let mut bytes = [0_u8; OracleConfiguration::LEN];
        config.encode(&mut bytes).unwrap();
        assert_eq!(OracleConfiguration::decode(&bytes).unwrap(), config);
        assert_eq!(OracleConfiguration::LEN, 207);
        bytes[45] = 6;
        assert!(OracleConfiguration::decode(&bytes).is_err());
    }

    #[test]
    fn derived_vaults_keep_rewards_and_reserve_compact() {
        assert_eq!(MarketRewards::LEN, 92);
        assert_eq!(FirstLossReserve::LEN, 51);
        let rewards = MarketRewards {
            header: header(AccountKind::MarketRewards),
            vault_bump: 253,
            market: [1; 32],
            reward_mint: [2; 32],
            reward_index: 3,
            undistributed_rewards: 4,
        };
        let mut reward_bytes = [0_u8; MarketRewards::LEN];
        rewards.encode(&mut reward_bytes).unwrap();
        assert_eq!(MarketRewards::decode(&reward_bytes).unwrap(), rewards);
        let reserve = FirstLossReserve {
            header: header(AccountKind::FirstLossReserve),
            market: [1; 32],
            deposited: 2,
            absorbed_losses: 3,
        };
        let mut reserve_bytes = [0_u8; FirstLossReserve::LEN];
        reserve.encode(&mut reserve_bytes).unwrap();
        assert_eq!(FirstLossReserve::decode(&reserve_bytes).unwrap(), reserve);
    }
}
