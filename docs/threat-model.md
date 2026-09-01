# Threat model

## Protected invariants

- One market cannot spend, seize, reserve, reward, or account for another market's assets.
- Lender claims do not exceed that market's net assets.
- Unhealthy collateral cannot be withdrawn.
- Debt and the borrow index never decrease except through repayment or finalized loss handling.
- Protocol plus creator fees never exceed accrued interest.
- Oracle failure blocks risk-increasing actions but permits repayment and collateral deposits.
- Borrow pauses cannot prevent repayment or safe collateral addition.

## Adversaries

- A malicious market creator choosing worthless collateral or a custom oracle.
- A borrower manipulating shallow DEX liquidity or transaction ordering.
- A lender exploiting rounding, donations, first-depositor behavior, or stale accrual.
- A liquidator attempting excessive seizure or account substitution.
- A compromised frontend, indexer, RPC endpoint, oracle source, keeper, or upgrade key.

## Controls

- Canonical PDAs and stored market relationships on every mutable account.
- Explicit signer, mint, authority, owner, and token-program validation.
- Checked fixed-point math with conservative rounding and bounded parameters.
- Strict Token-2022 extension allowlist.
- Two-publisher oracle rounds that conservatively combine price, confidence, deviation, liquidity,
  and time; neither publisher can independently create a usable observation.
- Virtual lender assets and shares to prevent profitable first-depositor donation inflation.
- Multiple RPC endpoints, finalized backfill, idempotent indexing, and direct-chain confirmation.
- Secured offline upgrade authority (preferably multisig/timelocked), independent audits, and public
  deployment manifests. A single authority is explicitly treated as a critical operational risk.

## Residual risk

Oracle checks and reserves cannot prevent price gaps, validator disruption, worthless collateral, or
insufficient liquidation demand. Permissionless markets are not reviewed products and can lose all
lender capital.
