#![cfg_attr(target_os = "solana", no_std)]

pub mod codec;
pub mod constants;
pub mod instruction;
pub mod math;
pub mod state;
pub mod validation;

#[cfg(feature = "bpf-entrypoint")]
mod entrypoint {
    use pinocchio::{
        default_panic_handler, no_allocator, program_entrypoint, AccountView, Address,
        ProgramResult,
    };

    use crate::instruction::LendingInstruction;

    program_entrypoint!(process_instruction);
    default_panic_handler!();
    no_allocator!();

    pub fn process_instruction(
        _program_id: &Address,
        _accounts: &mut [AccountView],
        instruction_data: &[u8],
    ) -> ProgramResult {
        // Dispatch is deliberately strict. Each handler is added only after its
        // account validation has differential tests against the Anchor program.
        let _instruction = LendingInstruction::decode(instruction_data)?;
        Err(pinocchio::error::ProgramError::InvalidInstructionData)
    }
}
