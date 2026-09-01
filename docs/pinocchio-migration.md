# Pinocchio optimization track

The Anchor implementation in `programs/meme_lending` remains the behavioral reference.
The optimized implementation lives in `programs/meme_lending_pinocchio` and will use a distinct
program ID. No mainnet state is shared implicitly between the two programs.

## Acceptance gates

The optimized program is the active deployment candidate. Public launch still requires:

1. Equivalent account ownership, signer, writable, PDA, mint, vault, and token-program checks.
2. End-to-end state-transition coverage for every public instruction against the compiled ELF.
3. The same oracle failure asymmetry: failures block borrowing and collateral withdrawal, but do
   not block repayment or collateral deposits.
4. Equivalent invariant and adversarial coverage, plus an independent audit.
5. Reproducible SBF artifacts with measured binary size and compute-unit results.

Binary size alone is not an acceptance criterion. Do not accept public deposits until all gates
above pass and the exact release binary has a target-cluster smoke test.

## Implemented optimizations

- The entrypoint uses Pinocchio's allocation-free account parser and `no_allocator` guard.
- Instruction tags are one byte and reject unknown or truncated input.
- Numeric instruction and state fields use checked, fixed-width little-endian codecs without Borsh.
- State accounts use a three-byte version/kind/bump header, preventing cross-account type confusion.
- Borrower positions occupy 91 bytes and lender positions occupy 107 bytes, with no Rust padding.
- Legacy version 1 markets occupy 260 bytes. Configurable-rate version 2 markets occupy 311 bytes
  versus 519 bytes for the Anchor account, retaining a 40.1% reduction. Three stored
  vault bumps allow cheap proof of the exact canonical vaults on every hot path. Other canonical
  vault/config/reward PDAs are derived instead of redundantly stored; approved rate curves and token
  program choices are represented by validated identifiers and bit flags.
- Oracle observations occupy 111 bytes and hot market totals mutate in place without full-account
  decoding or serialization.
- Lending arithmetic matches the reference program's conservative rounding test vectors.

Optimized program ID: `8hDEL5BuW2BgeMuCBKqZyRubGTqFmx8Ds3PQ2k6puJym`.
