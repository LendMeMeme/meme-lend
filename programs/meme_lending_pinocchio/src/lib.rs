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

solana_address::declare_id!("FvnWFJpAfdps7tTYzcg2ByKHufRxN7RyiLni1oB3jFaX");
pub const INITIAL_AUTHORITY: pinocchio::Address =
    pinocchio::Address::from_str_const("5o32MNK5Fs6bW8g8H63z91gUn5E7XJJaFkZvXd4mAh5t");

#[cfg(feature = "bpf-entrypoint")]
solana_security_txt::security_txt! {
    name: "Meme Lend (Pinocchio)",
    project_url: "https://meme-lendweb-production.up.railway.app",
    contacts: "link:https://github.com/CryptoDungeonMaster/meme-lend/security/advisories/new",
    policy: "https://github.com/CryptoDungeonMaster/meme-lend/blob/main/SECURITY.md",
    preferred_languages: "en",
    source_code: "https://github.com/CryptoDungeonMaster/meme-lend"
}

#[cfg(feature = "bpf-entrypoint")]
mod entrypoint {
    use pinocchio::{
        no_allocator, nostd_panic_handler, program_entrypoint, AccountView, Address, ProgramResult,
    };

    use crate::instruction::LendingInstruction;

    program_entrypoint!(process_instruction);
    nostd_panic_handler!();
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
            LendingInstruction::CreateMarket => {
                crate::handlers::create_market(_program_id, _accounts, instruction_data)
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
            LendingInstruction::SupplyUsdc => {
                crate::handlers::supply_usdc(_program_id, _accounts, instruction_data)
            }
            LendingInstruction::WithdrawUsdc => {
                crate::handlers::withdraw_usdc(_program_id, _accounts, instruction_data)
            }
            LendingInstruction::SubmitOracleObservation => {
                crate::handlers::submit_oracle_observation(_program_id, _accounts, instruction_data)
            }
            LendingInstruction::DepositCollateral => {
                crate::handlers::deposit_collateral(_program_id, _accounts, instruction_data)
            }
            LendingInstruction::WithdrawCollateral => {
                crate::handlers::withdraw_collateral(_program_id, _accounts, instruction_data)
            }
            LendingInstruction::BorrowUsdc => {
                crate::handlers::borrow_usdc(_program_id, _accounts, instruction_data)
            }
            LendingInstruction::RepayUsdc => {
                crate::handlers::repay_usdc(_program_id, _accounts, instruction_data)
            }
            LendingInstruction::DepositFirstLossReserve => {
                crate::handlers::deposit_first_loss_reserve(
                    _program_id,
                    _accounts,
                    instruction_data,
                )
            }
            LendingInstruction::ClaimMarketCreatorFees => {
                crate::handlers::claim_market_creator_fees(_program_id, _accounts, instruction_data)
            }
            LendingInstruction::ClaimProtocolFees => {
                crate::handlers::claim_protocol_fees(_program_id, _accounts, instruction_data)
            }
            LendingInstruction::Liquidate => {
                crate::handlers::liquidate(_program_id, _accounts, instruction_data)
            }
            LendingInstruction::FundLenderRewards => {
                crate::handlers::fund_lender_rewards(_program_id, _accounts, instruction_data)
            }
            LendingInstruction::ClaimLenderRewards => {
                crate::handlers::claim_lender_rewards(_program_id, _accounts, instruction_data)
            }
        }
    }
}
