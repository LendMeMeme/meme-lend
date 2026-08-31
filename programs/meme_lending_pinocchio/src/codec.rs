use solana_program_error::ProgramError;

#[derive(Clone, Copy)]
pub struct Decoder<'a> {
    remaining: &'a [u8],
}

impl<'a> Decoder<'a> {
    #[inline(always)]
    pub const fn new(data: &'a [u8]) -> Self {
        Self { remaining: data }
    }

    #[inline(always)]
    pub fn take<const N: usize>(&mut self) -> Result<&'a [u8; N], ProgramError> {
        let (head, tail) = self
            .remaining
            .split_at_checked(N)
            .ok_or(ProgramError::InvalidInstructionData)?;
        self.remaining = tail;
        head.try_into()
            .map_err(|_| ProgramError::InvalidInstructionData)
    }

    #[inline(always)]
    pub fn u8(&mut self) -> Result<u8, ProgramError> {
        Ok(self.take::<1>()?[0])
    }

    #[inline(always)]
    pub fn u16(&mut self) -> Result<u16, ProgramError> {
        Ok(u16::from_le_bytes(*self.take()?))
    }

    #[inline(always)]
    pub fn u32(&mut self) -> Result<u32, ProgramError> {
        Ok(u32::from_le_bytes(*self.take()?))
    }

    #[inline(always)]
    pub fn u64(&mut self) -> Result<u64, ProgramError> {
        Ok(u64::from_le_bytes(*self.take()?))
    }

    #[inline(always)]
    pub fn u128(&mut self) -> Result<u128, ProgramError> {
        Ok(u128::from_le_bytes(*self.take()?))
    }

    #[inline(always)]
    pub fn i64(&mut self) -> Result<i64, ProgramError> {
        Ok(i64::from_le_bytes(*self.take()?))
    }

    #[inline(always)]
    pub fn finish(self) -> Result<(), ProgramError> {
        self.remaining
            .is_empty()
            .then_some(())
            .ok_or(ProgramError::InvalidInstructionData)
    }
}

pub struct Encoder<'a> {
    remaining: &'a mut [u8],
}

impl<'a> Encoder<'a> {
    #[inline(always)]
    pub fn new(data: &'a mut [u8]) -> Self {
        Self { remaining: data }
    }

    #[inline(always)]
    pub fn put(&mut self, bytes: &[u8]) -> Result<(), ProgramError> {
        let remaining = core::mem::take(&mut self.remaining);
        let (head, tail) = remaining
            .split_at_mut_checked(bytes.len())
            .ok_or(ProgramError::AccountDataTooSmall)?;
        head.copy_from_slice(bytes);
        self.remaining = tail;
        Ok(())
    }

    #[inline(always)]
    pub fn finish(self) -> Result<(), ProgramError> {
        self.remaining
            .is_empty()
            .then_some(())
            .ok_or(ProgramError::InvalidAccountData)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decoder_is_exact_and_allocation_free() {
        let mut decoder = Decoder::new(&[7, 2, 0]);
        assert_eq!(decoder.u8().unwrap(), 7);
        assert_eq!(decoder.u16().unwrap(), 2);
        assert!(decoder.finish().is_ok());
        assert!(Decoder::new(&[1]).u64().is_err());
    }

    #[test]
    fn encoder_rejects_wrong_account_size() {
        let mut bytes = [0_u8; 2];
        let mut encoder = Encoder::new(&mut bytes);
        encoder.put(&[1]).unwrap();
        assert!(encoder.finish().is_err());
    }
}
