# Managed oracle operations

Lend Meme Loans uses a custom signed publisher until fixture-tested native on-chain adapters are
deployed. This is explicitly classified as high risk on-chain and in the indexer. The publisher does
not make unsupported collateral safe.

## Safety model

The publisher refuses to submit unless all of these conditions hold:

- DEX Screener reports at least two independently identified Solana DEX venues and the configured
  minimum combined liquidity;
- at least one additional independent provider (Jupiter or a configured Pyth feed) returns a fresh
  price;
- all retained sources are fresh and their median deviation is within the configured bound;
- the new observation is within the market's immutable confidence and price-deviation limits; and
- the liquidity-adjusted recoverable amount is positive.

The recoverable limit is the smaller of the configured hard cap and the configured haircut of
observed multi-DEX liquidity. This is deliberately conservative and must not be interpreted as a
guaranteed liquidation result.

If validation fails, no observation is published. Once the prior observation expires, borrowing,
collateral withdrawal, and liquidation fail closed. Repayment and collateral deposits remain
available because those instructions do not depend on an oracle.

## Publisher separation and failover

Every frontend-created market freezes these two publisher addresses into its immutable oracle
configuration:

- primary: `6DJEenuAhzDojLcGgDhs8MjtxbP9xnUpAdUG5qVmZBa1`
- backup: `GsoCUeJyngZMnt4Mm9Uptgavp9Poq1EskoKUou8ackGV`

Run two isolated Railway services from the same repository and give each only its own keypair secret.
The primary uses `ORACLE_STANDBY=false`. The backup uses `ORACLE_STANDBY=true` and publishes only when
the previous observation is older than `ORACLE_FAILOVER_AFTER_SECONDS`. Use different RPC providers,
price-provider credentials, deployment regions, and alert destinations where possible.

Never place either secret key in GitHub, frontend variables, build logs, or MongoDB. The local keys
are stored outside the repository under the user's Solana configuration directory.

## Railway services

For both services, set the start command to:

```text
pnpm --filter @meme-lend/oracle-publisher start
```

Set the variables documented in `.env.example`. Production requires a private Solana RPC, a Jupiter
API key, and a Pyth API key plus per-mint feed mappings for assets Pyth supports. The service exposes:

- `GET /health`: process liveness, publisher address, and last cycle time;
- `GET /ready`: readiness, last completely successful cycle, consecutive failed cycles, and sanitized
  market errors.

Configure Railway health checks against `/ready`. Route `ALERT_WEBHOOK_URL` to a monitored incident
channel. An alert is sent on the first failed cycle and every fourth consecutive failure.
The service also fails readiness below `ORACLE_MINIMUM_BALANCE_LAMPORTS`; replenish publisher SOL
before that threshold is reached.

## Market admission

An arbitrary mint is not automatically publishable. Before allowing liquidity:

1. confirm the program accepts the mint and its token extensions;
2. confirm at least two independent DEX venues and the liquidity floor;
3. confirm Jupiter or a mapped Pyth feed provides an independent fresh price;
4. run the publisher against the market and confirm an observation on-chain;
5. verify primary and standby health checks and alerts; and
6. seed the first-loss reserve before inviting lenders.
