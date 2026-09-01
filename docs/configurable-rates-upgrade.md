# Configurable rates upgrade review

## Deployment effect

This source changes `CreateMarket` to create version 2 market accounts with an immutable configurable
APR curve. It does not mutate, resize, or migrate an existing account. Every existing version 1
market remains 260 bytes and continues using its original Standard or Conservative constants. New
version 2 markets are 311 bytes and use the curve committed to their configuration hash.

The instruction tag and all existing mutable-field offsets remain stable. Existing supply,
withdrawal, collateral, borrow, repayment, liquidation, fee, reserve, reward, pause, and oracle
instructions decode either market version. Repayment and collateral deposits still omit oracle
accounts; borrowing and collateral withdrawal still require a fresh valid observation.

## Rollout order

1. Publish and review the reproducible SBF artifact and its SHA-256 digest.
2. Deploy the indexer first so startup reconciliation discovers both 260-byte and 311-byte markets.
3. Reconcile all existing markets and confirm their projected rates match their legacy constants.
4. Upgrade the program with the reviewed artifact. Do not initialize or migrate market accounts.
5. Deploy the SDK and web app together. Old indexed documents remain readable during the rolling
   update; the indexer adds the curve fields on reconciliation.
6. Create a tightly capped canary market only after the upgrade is approved, then verify its config
   hash, curve, accrual, repayment, and isolation on-chain before enabling general creation.

## Security properties

- Curve ordering, utilization, shape, and the 20,000,000% APR technical ceiling are enforced on-chain.
- All rate, accrual, debt, share, fee, and projection calculations use integer arithmetic with explicit
  overflow checks and conservative rounding.
- The borrow index is capped so aggregate debt remains representable by repayment instructions even
  after the maximum elapsed time at the maximum APR.
- A market's curve is immutable, domain-separated in its configuration hash, and cannot affect any
  other market.
- Extreme curves are classified experimental/high-risk; above 1,000% APR requires explicit creator
  acknowledgment in the official client.

## Remaining risks and approval gates

- The 20,000,000% ceiling is intentionally permissive and can make a borrower's debt grow extremely
  quickly. UI acknowledgment is not a substitute for user diligence or independent audits.
- Lender APR is a utilization-based variable estimate, not guaranteed return and not compounded APY.
- Transaction-level validator coverage depends on a configured Solana/Anchor local environment. A
  skipped validator test is not equivalent to a pass.
- Mainnet deployment remains prohibited until the reproducible binary digest is recorded, an
  independent review resolves every medium/high finding, and the upgrade authority explicitly
  approves this report and the exact source revision.
