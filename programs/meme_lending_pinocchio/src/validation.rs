use pinocchio::{error::ProgramError, AccountView, Address};

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
