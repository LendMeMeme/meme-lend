# Lend Meme Loans

Lend Meme Loans is an isolated-market lending protocol for borrowing USDC against memecoin
collateral on Solana. Every market owns separate vaults, positions, accounting, oracle
configuration, reserve, and bad-debt ledger.

The protocol is permissionless infrastructure, not an endorsement of any market. A market's
status and first-loss reserve do not guarantee repayment.

## Workspace

- `programs/meme_lending_pinocchio`: active optimized deployment candidate
- `programs/meme_lending`: Anchor behavioral reference and invariant-oriented Rust tests
- `packages/sdk`: canonical PDA, fixed-point math, quote, and transaction helpers
- `packages/database`: MongoDB schemas and idempotent repositories
- `packages/shared`: cross-service types and validation
- `apps/indexer`: finalized event ingestion, backfill, and query API
- `apps/liquidator`: permissionless liquidation keeper
- `apps/web`: Next.js 15 application
- `tests/anchor`: local-validator end-to-end coverage
- `docs`: economic specification, architecture, threat model, and operations

## Trust boundary

Solana accounts are the source of truth. MongoDB and analytics are disposable derived data.
Oracle failure blocks borrowing and collateral withdrawal, while repayment and collateral
addition remain available.
