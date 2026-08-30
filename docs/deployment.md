# Deployment and operations

## Current readiness boundary

Native Rust, TypeScript, indexer/SDK tests, and the Next.js production build are verified locally.
The most recent SBF artifact and generated IDL predate the final reward-claim, Token-2022 extension,
and approved-preset changes because the host's WSL distribution disappeared during the final build.
Do not deploy `target/deploy/meme_lending.so` or consume the checked-in generated IDL until an Anchor
0.31.1 SBF build and local-validator tests are rerun and the generated files are copied into the SDK.

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
- Multisig upgrade authority and timelock are active; no developer wallet controls upgrades alone.
- Incident contacts, pause procedure, and public status channel are documented.

## Environments

Localnet uses disposable keys and mints. Devnet uses a dedicated multisig and verified public RPC
endpoints. Mainnet configuration is never copied from devnet without re-verifying every address.

## Rollout

Deploy the binary, verify its buffer and authority, initialize the approved USDC configuration,
start the finalized indexer, then create a capped test market. Exercise supply, collateral, borrow,
repay, withdraw, liquidation, reserve, reward, and fee flows before public discovery is enabled.

## Failure behavior

If oracles fail, do not bypass validation: borrowing and collateral withdrawal remain blocked while
repayment and collateral addition remain available. If the indexer fails, the frontend displays
unavailable history and continues to rely on direct account reads for transaction-critical state.
