# Deployment and operations

## Railway services

The repository-level `railpack.json` deliberately forces Railpack's Node provider. The monorepo
also contains a Rust toolchain file for the Solana program, which otherwise causes Railpack to
select the Rust provider and omit Node and pnpm from application-service images.

Configure the three Railway services with these commands:

| Service    | Build command                               | Start command                               |
| ---------- | ------------------------------------------- | ------------------------------------------- |
| Web        | `pnpm --filter @meme-lend/web build`        | `pnpm --filter @meme-lend/web start`        |
| Indexer    | `pnpm --filter @meme-lend/indexer build`    | `pnpm --filter @meme-lend/indexer start`    |
| Liquidator | `pnpm --filter @meme-lend/liquidator build` | `pnpm --filter @meme-lend/liquidator start` |

Do not remove the explicit Node provider unless each service is moved to an application-specific
root directory. Verify that every deployment plan includes Node and pnpm before its build step.

## Current readiness boundary

Native Rust, TypeScript, indexer/SDK tests, and the Next.js production build are verified locally.
GitHub Actions produces the SBF artifact with Anchor 0.31.1's reproducible container, extracts its
embedded security metadata, records its SHA-256 digest, and publishes the generated IDL with the
artifact. A new successful reproducible build is required for every program change. Local-validator
transaction tests must still pass against that exact release before deployment.

Native Pyth, Switchboard, and DEX adapter parsers are also a launch blocker; see `oracle-policy.md`.

## Pre-deployment checklist

- All native, SBF, local-validator, TypeScript, frontend, and adversarial gates pass.
- Program ID, IDL address, SDK constant, service variables, and explorer links match.
- Build is reproducible and its binary hash is published.
- Independent audit findings are resolved or explicitly accepted.
- Approved loan mint and every oracle source account are verified on the target cluster.
- Token-2022 extension rejection is exercised with real mint fixtures.
- RPC HTTP/WebSocket failover and MongoDB backups are configured.
- Indexer backfill is tested from an empty database and from a stale checkpoint.
- Liquidator has a funded, rate-limited key with no protocol privilege.
- The upgrade authority matches the explicitly approved release authority. A single-key authority is
  supported but is a documented critical operational risk: compromise permits arbitrary upgrades.
  Store it offline, never place it in CI or Railway, and transfer authority before public launch if
  governance requirements change.
- Incident contacts, pause procedure, and public status channel are documented.

The reproducible build and post-deployment verification procedure is documented in
[`verifiable-build.md`](./verifiable-build.md). Publish the exact source revision before claiming
that an on-chain binary is independently verifiable.

## Environments

Localnet uses disposable keys and mints. Mainnet configuration must never be copied from another
cluster without re-verifying every address. Protocol initialization requires the current program
upgrade authority to sign, preventing a third party from capturing the global configuration after
deployment.

## Rollout

Deploy the binary, verify its buffer and authority, initialize the approved USDC configuration,
start the finalized indexer, then create a capped test market. Exercise supply, collateral, borrow,
repay, withdraw, liquidation, reserve, reward, and fee flows before public discovery is enabled.

## Failure behavior

If oracles fail, do not bypass validation: borrowing and collateral withdrawal remain blocked while
repayment and collateral addition remain available. If the indexer fails, the frontend displays
unavailable history and continues to rely on direct account reads for transaction-critical state.
