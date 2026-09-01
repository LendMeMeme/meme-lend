# Testing strategy

## Required gates

1. `cargo test -p meme_lending --lib` verifies fixed-point, rounding, utilization, interest-index,
   LLTV, share, debt-share, and liquidation math.
2. `anchor build` verifies the deployable SBF binary, stack limits, IDL, and generated client types.
3. `anchor test` starts a clean validator, deploys the exact SBF artifact, and runs transaction-level
   account and authorization tests.
4. `pnpm -r check` validates every TypeScript boundary.
5. `pnpm -r test` validates SDK parity, event idempotency, classifications, and frontend transaction
   state logic.
6. `pnpm --filter @meme-lend/web build` validates every production route.

## Adversarial matrix

Every program instruction must receive negative tests for wrong market, vault, mint, token program,
authority, owner, PDA bump, and signer. Economic sequences must cover first depositor donation,
micro-deposit rounding, maximum values, stale accrual, stale/negative/deviating oracle data, price
gaps, partial and terminal liquidation, reserve exhaustion, fee bounds, and two-market isolation.

Configurable-rate coverage includes the 20,000,000% APR boundary, invalid and non-monotonic curves,
linear/quadratic/cubic parity vectors, maximum elapsed time, overflow and rounding, full and partial
repayment, version 1 decoding, version 2 round trips, configuration-hash uniqueness, cross-layer
formula parity, and adversarial isolation under extreme debt.

The local validator suite uses real SPL Token and Token-2022 programs. Production deployment remains
blocked until this matrix passes against the final program binary and an independent audit reviews it.
