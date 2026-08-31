# Architecture

## Isolation boundary

The `Market` PDA is the root of every lending pool. Its address is derived from a canonical
hash containing the collateral mint, loan mint, oracle configuration, liquidation LTV, interest
model, caps, fee preset, and a schema version. Every vault and position contains or derives from
that market address.

No global liquidity exists. Instructions validate the market recorded by every position, mint,
vault, token program, and oracle account. Consequently, a market cannot present another market's
vault as its own or socialize a loss outside its own state.

## Components

1. The Anchor program owns custody and enforces solvency constraints.
2. The SDK implements the same integer quote math and builds human-readable transactions.
3. The indexer backfills finalized signatures and consumes WebSocket events. MongoDB stores only
   derived query models and restart checkpoints.
4. The web app reads critical accounts from RPC and uses the indexer for discovery and history.
5. The liquidator independently identifies unhealthy positions and submits ordinary program
   transactions. It has no privileged custody role.

## Action matrix during failures

| Action              | Oracle unavailable          | Market borrow-paused       | Protocol emergency |
| ------------------- | --------------------------- | -------------------------- | ------------------ |
| Supply USDC         | allowed                     | allowed                    | allowed            |
| Withdraw USDC       | allowed if liquid           | allowed if liquid          | allowed if liquid  |
| Add collateral      | allowed                     | allowed                    | allowed            |
| Repay               | allowed                     | allowed                    | allowed            |
| Borrow              | blocked                     | blocked                    | blocked            |
| Withdraw collateral | blocked                     | blocked only if configured | blocked            |
| Liquidate           | blocked without valid price | allowed                    | policy-controlled  |

## Token policy

The loan mint is governance-approved USDC. Legacy SPL Token and Token-2022 are identified from
their actual program owners; callers cannot choose an inconsistent program. Token-2022 mints are
accepted only when all extensions are explicitly allowed. The MVP rejects transfer fees, transfer
hooks, permanent delegates, confidential transfers, pausable tokens, and other extensions that can
change received balances or introduce external control.

## Upgrades

Development and early audited deployments remain upgradeable. The explicitly approved release
authority may be a secured single offline key, although that creates a critical key-compromise risk;
a multisig and timelock remain the safer governance target. Every release uses reproducible build
hashes. Upgrades may add features
but must not reinterpret an existing market's immutable configuration.
