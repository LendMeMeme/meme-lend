use mollusk_svm::Mollusk;
use solana_account::Account;
use solana_instruction::{AccountMeta, Instruction};
use solana_pubkey::Pubkey;

const PROGRAM_ID: Pubkey = solana_pubkey::pubkey!("FvnWFJpAfdps7tTYzcg2ByKHufRxN7RyiLni1oB3jFaX");
const INITIAL_AUTHORITY: Pubkey =
    solana_pubkey::pubkey!("5o32MNK5Fs6bW8g8H63z91gUn5E7XJJaFkZvXd4mAh5t");
const SYSTEM_PROGRAM: Pubkey = solana_pubkey::pubkey!("11111111111111111111111111111111");
const NATIVE_LOADER: Pubkey = solana_pubkey::pubkey!("NativeLoader1111111111111111111111111111111");

#[test]
fn deployable_elf_initializes_protocol_state() {
    let manifest = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let sbf_out = manifest.join("../../target/deploy");
    std::env::set_var("SBF_OUT_DIR", &sbf_out);

    let (global, bump) = Pubkey::find_program_address(&[b"global-config"], &PROGRAM_ID);
    let loan_mint = Pubkey::new_unique();
    let fee_recipient = Pubkey::new_unique();
    let mut data = vec![0];
    data.extend_from_slice(loan_mint.as_ref());
    data.extend_from_slice(fee_recipient.as_ref());
    data.extend_from_slice(&60_u32.to_le_bytes());
    data.push(bump);
    let instruction = Instruction::new_with_bytes(
        PROGRAM_ID,
        &data,
        vec![
            AccountMeta::new(INITIAL_AUTHORITY, true),
            AccountMeta::new(global, false),
            AccountMeta::new_readonly(SYSTEM_PROGRAM, false),
        ],
    );
    let accounts = vec![
        (
            INITIAL_AUTHORITY,
            Account::new(10_000_000_000, 0, &SYSTEM_PROGRAM),
        ),
        (global, Account::default()),
        (
            SYSTEM_PROGRAM,
            Account {
                lamports: 1,
                data: vec![],
                owner: NATIVE_LOADER,
                executable: true,
                rent_epoch: 0,
            },
        ),
    ];

    let mollusk = Mollusk::new(&PROGRAM_ID, "meme_lending_pinocchio");
    let result = mollusk.process_instruction(&instruction, &accounts);
    assert!(result.program_result.is_ok(), "{result:?}");
    let global_account = result
        .resulting_accounts
        .iter()
        .find(|(key, _)| key == &global)
        .expect("global account created");
    assert_eq!(global_account.1.owner, PROGRAM_ID);
    assert_eq!(global_account.1.data.len(), 144);
    assert_eq!(&global_account.1.data[3..35], INITIAL_AUTHORITY.as_ref());
    assert_eq!(&global_account.1.data[67..99], loan_mint.as_ref());
}
