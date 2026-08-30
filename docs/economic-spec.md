# Economic specification

All calculations use checked integer arithmetic. Prices and rates use explicit fixed-point scales;
token quantities remain in native mint units until normalized with checked powers of ten.

## Lender shares

Before a deposit or withdrawal, interest is accrued. Market assets are:

```text
cash + performing debt - earned protocol fees - earned creator fees
```

When no shares exist, deposited assets mint shares one-for-one in normalized units. Otherwise:

```text
deposit shares = floor(deposit assets * total shares / assets before deposit)
withdraw assets = floor(burned shares * total assets / total shares)
```

Deposits that round to zero shares and withdrawals that round to zero assets fail. Rounding never
creates a claim larger than market assets.

## Borrow debt

Debt uses borrow shares and a monotonically non-decreasing borrow index. Accrued interest is rounded
up. Repayment is capped at actual debt, and full repayment clears residual dust explicitly.

## Interest model

Utilization is debt divided by cash plus debt. The per-year borrow rate is piecewise linear:

```text
u <= target: base + slope_low * u / target
u > target:  base + slope_low + slope_high * (u-target) / (1-target)
```

The result is capped by the immutable maximum borrow rate. Supply interest is borrow interest times
utilization, net of immutable protocol and creator fee shares.

## Borrowing limit

The maximum resulting debt is the minimum of:

1. oracle collateral value multiplied by LLTV;
2. available USDC cash;
3. immutable market borrow cap;
4. immutable wallet borrow cap; and
5. the fresh oracle adapter's conservative `max_recoverable_usdc`.

Off-chain liquidity analytics can only reduce warnings and discovery ranking; they cannot increase
the enforceable limit. An adapter without a valid recoverable-value limit cannot authorize borrowing.

## Liquidation and loss

An account is liquidatable only when debt exceeds oracle collateral value times liquidation LTV.
The ordinary close factor limits repayment, except terminal dust/insolvency handling. Collateral
seized equals repaid value plus the immutable liquidation incentive, rounded conservatively and
capped by deposited collateral.

If collateral is exhausted and debt remains, the remainder becomes finalized bad debt. The market's
first-loss reserve transfers USDC into its liquidity vault up to the loss. Any remainder reduces only
that market's lender exchange rate. Loss cannot be charged to another market.

## Fees and rewards

Protocol and creator fees are immutable preset shares of interest actually accrued. Their sum cannot
exceed accrued interest. Creator claims come only from the market's claimable fee counter.

Reward tokens use a separate vault and index. Rewards never count as lending assets and cannot make
USDC withdrawals insolvent. A market has at most one active reward mint. Supply-share mutations settle
the lender's reward checkpoint first, preventing new lenders from claiming historical rewards.
