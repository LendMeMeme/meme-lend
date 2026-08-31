use pinocchio::{cpi::Signer, error::ProgramError, AccountView, ProgramResult};
use pinocchio_token::{instructions::TransferChecked, TokenInterface, TokenProgram};

/// Checked transfer shared by SPL Token and Token-2022. The program address is
/// verified once here and then passed to the optimized unchecked CPI writer.
#[allow(clippy::too_many_arguments)]
pub fn transfer_checked(
    token_program: &AccountView,
    from: &AccountView,
    mint: &AccountView,
    to: &AccountView,
    authority: &AccountView,
    amount: u64,
    decimals: u8,
    signers: &[Signer],
) -> ProgramResult {
    if !token_program.executable() {
        return Err(ProgramError::IncorrectProgramId);
    }
    TokenProgram::verify(token_program.address())?;
    let transfer =
        TransferChecked::<&AccountView>::new(from, mint, to, authority, amount, decimals);
    transfer.invoke_signed_with_unverified_program(signers, token_program.address())
}
