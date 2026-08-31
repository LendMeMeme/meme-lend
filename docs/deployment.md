# Deployment and operations

## Mainnet deployment

- Program: `FvnWFJpAfdps7tTYzcg2ByKHufRxN7RyiLni1oB3jFaX`
- Program-data account: `9tuptzScxeBd88WBpwtmxudF3GC2NDpZ7EhNXjEeyVdL`
- Upgrade authority: `5o32MNK5Fs6bW8g8H63z91gUn5E7XJJaFkZvXd4mAh5t`
- Deployment slot: `443233025`
- Deployment transaction: `2PpJXCJ38iQTxKLPCpYAye8YLEKQ4kzWzbRndBQDXKZYQ1MMT7x7yea46rgUdf6XXyWTDVvNsT36kPDAww7ncrW4`
- Release ELF: 146,088 bytes, SHA-256
  `7FB437024FB951BEE5E3737E1DA8F4EAAA679BEE3AE2805D8E7DC8E94C58E049`
- Program-data allocation: 292,176 bytes; the release ELF matches the on-chain prefix exactly and
  all remaining upgrade-capacity bytes are zero.

Deployment does not initialize the global protocol configuration. Initialization requires
separately verified target-cluster loan-mint and fee-recipient inputs.

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

Native Rust, TypeScript, indexer/SDK tests, the optimized SBF ELF execution test, and the Next.js
production build are verified locally. GitHub Actions produces both the Anchor reference artifact
and the active Pinocchio deployment candidate, extracts their embedded security metadata, records
SHA-256 digests, and publishes them together. A new successful reproducible build is required for
every program change.

The active optimized release currently accepts only its explicitly configured signed observation
source. Native Pyth, Switchboard, and DEX adapters must not be advertised as active; see
`oracle-policy.md`.

## Pre-deployment checklist

- All native, SBF/ELF, TypeScript, frontend, and adversarial gates pass on the release revision.
- The exact release artifact passes a funded target-cluster smoke test before public deposits open.
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

Deploy `meme_lending_pinocchio.so`, verify its buffer and authority, initialize the approved USDC configuration,
start the finalized indexer, then create a capped test market. Exercise supply, collateral, borrow,
repay, withdraw, liquidation, reserve, reward, and fee flows before public discovery is enabled.

## Failure behavior

If oracles fail, do not bypass validation: borrowing and collateral withdrawal remain blocked while
repayment and collateral addition remain available. If the indexer fails, the frontend displays
unavailable history and continues to rely on direct account reads for transaction-critical state.
