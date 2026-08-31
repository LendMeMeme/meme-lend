#![cfg_attr(target_os = "solana", no_std)]

pub mod codec;
pub mod constants;
pub mod cpi;
pub mod engine;
pub mod handlers;
pub mod instruction;
pub mod math;
pub mod pda;
pub mod state;
pub mod validation;

solana_address::declare_id!("3rkRSEiVbummMYVx91shz5obS1pQQGEkTpGZoHBUx4an");
pub const INITIAL_AUTHORITY: pinocchio::Address =
    pinocchio::Address::from_str_const("52sZ6c8HUZh3H54Xr674xKKyJfqBPSpUnQfNwwRrffHA");

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
        match LendingInstruction::decode(instruction_data)? {
            LendingInstruction::InitializeProtocol => {
                crate::handlers::initialize_protocol(_program_id, _accounts, instruction_data)
            }
            LendingInstruction::SetProtocolPause => {
                crate::handlers::set_protocol_pause(_program_id, _accounts, instruction_data)
            }
            LendingInstruction::PauseMarket => {
                crate::handlers::pause_market(_program_id, _accounts, instruction_data)
            }
            LendingInstruction::AccrueInterest => {
                crate::handlers::accrue_interest(_program_id, _accounts, instruction_data)
            }
            _ => Err(pinocchio::error::ProgramError::InvalidInstructionData),
        }
    }
}
