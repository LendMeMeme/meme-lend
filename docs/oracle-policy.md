# Oracle policy

Oracle adapters return a normalized collateral/USDC price, confidence information when available,
observation time, pair identity, decimals, and a conservative recoverable-USDC limit.

Risk-increasing actions validate:

- the configured adapter and source-account owners;
- exact collateral and loan mints;
- positive price and supported decimals;
- maximum age;
- confidence-width bound where supported;
- maximum deviation from the configured reference/TWAP rule; and
- a fresh positive liquidity-adjusted limit.

The state model reserves immutable adapter kinds for Pyth, Switchboard, multi-pool DEX TWAPs,
aggregated multi-pool observations, and custom publishers. Until native account parsers compile against
the approved Anchor/SPL dependency baseline, market creation and observation submission accept only
`Custom`. This is enforced on-chain, not merely hidden in the UI. Custom observations are accepted only
from source public keys frozen into the market configuration. An instantaneous single-pool spot price
is never a trusted oracle.

Experimental adapters remain visibly labeled `Custom oracle — high risk`. Market classification
does not erase this label. Oracle failure blocks borrowing, collateral withdrawal, and liquidation;
it never blocks repayment or collateral deposits.

Devnet or production launch is blocked until every enabled non-custom adapter has fixture-tested native
account parsing and an allowlisted publisher deployment. Custom-publisher markets remain permissionless
and prominently high risk.

The August 2026 compatibility audit tested `pyth-solana-receiver-sdk` 2.0.0, 1.0.1, and 0.6.1.
Version 2.0.0 targets Anchor 1.1; 1.0.1 resolves an incompatible Borsh graph; and 0.6.1 conflicts with
the current SPL Token-2022 dependency graph. The failed pins were removed and the clean Anchor 0.31.1
graph was reverified. Do not bypass this with an unversioned manual account-layout parser.
