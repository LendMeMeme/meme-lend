use pinocchio::{error::ProgramError, AccountView, Address};
use pinocchio_token::{TokenInterface, TokenProgram};
use pinocchio_token_2022::state::{
    ExtensionType, Mint as Token2022Mint, StateWithExtensions, MAX_EXTENSIONS,
};

#[inline(always)]
pub fn signer(account: &AccountView) -> Result<(), ProgramError> {
    account
        .is_signer()
        .then_some(())
        .ok_or(ProgramError::MissingRequiredSignature)
}

#[inline(always)]
pub fn writable(account: &AccountView) -> Result<(), ProgramError> {
    account
        .is_writable()
        .then_some(())
        .ok_or(ProgramError::InvalidArgument)
}

#[inline(always)]
pub fn owner(account: &AccountView, expected: &Address) -> Result<(), ProgramError> {
    account
        .owned_by(expected)
        .then_some(())
        .ok_or(ProgramError::IllegalOwner)
}

#[inline(always)]
pub fn address(account: &AccountView, expected: &Address) -> Result<(), ProgramError> {
    (account.address() == expected)
        .then_some(())
        .ok_or(ProgramError::InvalidArgument)
}

/// Duplicate writable accounts can violate handler assumptions and make unchecked
/// in-place borrows unsound, so optimized handlers reject them before borrowing.
pub fn distinct_writable(accounts: &[AccountView]) -> Result<(), ProgramError> {
    let mut left = 0;
    while left < accounts.len() {
        if accounts[left].is_writable() {
            let mut right = left + 1;
            while right < accounts.len() {
                if accounts[right].is_writable()
                    && accounts[left].address() == accounts[right].address()
                {
                    return Err(ProgramError::InvalidArgument);
                }
                right += 1;
            }
        }
        left += 1;
    }
    Ok(())
}

pub struct TokenAccountBase {
    pub mint: [u8; 32],
    pub authority: [u8; 32],
    pub amount: u64,
}

pub fn token_account(
    account: &AccountView,
    token_program: &AccountView,
) -> Result<TokenAccountBase, ProgramError> {
    if !token_program.executable() {
        return Err(ProgramError::IncorrectProgramId);
    }
    TokenProgram::verify(token_program.address())?;
    owner(account, token_program.address())?;
    let data = account.try_borrow()?;
    if data.len() < 165 || data[108] != 1 {
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(TokenAccountBase {
        mint: data[0..32]
            .try_into()
            .map_err(|_| ProgramError::InvalidAccountData)?,
        authority: data[32..64]
            .try_into()
            .map_err(|_| ProgramError::InvalidAccountData)?,
        amount: u64::from_le_bytes(
            data[64..72]
                .try_into()
                .map_err(|_| ProgramError::InvalidAccountData)?,
        ),
    })
}

pub fn mint_decimals(mint: &AccountView, token_program: &AccountView) -> Result<u8, ProgramError> {
    if !token_program.executable() {
        return Err(ProgramError::IncorrectProgramId);
    }
    TokenProgram::verify(token_program.address())?;
    if token_program.address() == &pinocchio_token::ID {
        let state = pinocchio_token::state::Mint::from_account_view(mint)?;
        if !state.is_initialized() {
            return Err(ProgramError::UninitializedAccount);
        }
        return Ok(state.decimals());
    }
    let state = StateWithExtensions::<Token2022Mint>::from_account_view(mint)?;
    if !state.base.is_initialized() {
        return Err(ProgramError::UninitializedAccount);
    }
    let mut extensions = [ExtensionType::Uninitialized; MAX_EXTENSIONS];
    if state.write_extension_types(&mut extensions)? != 0 {
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(state.base.decimals())
}
