# Pinocchio optimization track

The Anchor implementation in `programs/meme_lending` remains the audited behavioral reference.
The optimized implementation lives in `programs/meme_lending_pinocchio` and will use a distinct
program ID. No mainnet state is shared implicitly between the two programs.

## Acceptance gates

The optimized program may replace the reference deployment candidate only after it has:

1. Equivalent account ownership, signer, writable, PDA, mint, vault, and token-program checks.
2. Differential state-transition tests for every public instruction.
3. The same oracle failure asymmetry: failures block borrowing and collateral withdrawal, but do
   not block repayment or collateral deposits.
4. Equivalent invariant and adversarial coverage, plus a new independent audit.
5. Reproducible SBF artifacts with measured binary size and compute-unit results.

Binary size alone is not an acceptance criterion. The Anchor version remains deployable until all
gates above pass.
