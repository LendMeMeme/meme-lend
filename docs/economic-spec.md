# Economic specification

All calculations use checked integer arithmetic. Prices and rates use explicit fixed-point scales;
token quantities remain in native mint units until normalized with checked powers of ten.

## Lender shares

Before a deposit or withdrawal, interest is accrued. Market assets are:

```text
cash + performing debt - earned protocol fees - earned creator fees
```

Conversions include a permanent virtual asset/share seed. It preserves one-for-one issuance for an
empty market while preventing a first depositor from profiting by donating assets before another
deposit. The effective formulas are:

```text
deposit shares = floor(deposit assets * (total shares + virtual shares)
                       / (assets before deposit + virtual assets))
withdraw assets = floor(burned shares * (total assets + virtual assets)
                        / (total shares + virtual shares))
```

Deposits that round to zero shares and withdrawals that round to zero assets fail. Rounding never
creates a claim larger than market assets.

## Borrow debt

Debt uses borrow shares and a monotonically non-decreasing borrow index. Aggregate market debt is
always derived from aggregate shares and the current index, including after borrow, repayment,
liquidation, bad-debt handling, and accrual. Accrued interest is rounded up. Repayment is capped at
actual debt, and full repayment clears residual dust explicitly.

## Interest model

Utilization is debt divided by cash plus debt. Version 1 markets permanently retain their original
Standard or Conservative fixed curve. Version 2 markets store five immutable values: starting
borrow APR, target utilization, borrow APR at target, maximum borrow APR, and a post-target shape
(linear, quadratic, or cubic).

```text
u <= target: start + (target_apr - start) * u / target
u > target:  target_apr + (max_apr - target_apr) * ((u-target) / (1-target)) ^ shape
```

The technical maximum is 20,000,000% APR (200,000 times principal per year). This is an arithmetic
limit, not a recommendation. Rates are simple annual percentage rates (APR), not compounded APY.
Supply APR is borrow APR times utilization, net of immutable protocol and creator fee shares, and is
always a variable estimate. Program, SDK, indexer, and frontend use the same conservative integer
rounding formula.

Accrual caps the borrow index at the largest value that keeps aggregate debt representable. Long
idle periods and extreme curves therefore cannot overflow permanent state or disable repayment.

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
Creators receive nothing for an empty market, and the protocol has no fake-volume or wash-borrowing
reward.

Reward tokens use a separate vault and index. Rewards never count as lending assets and cannot make
USDC withdrawals insolvent. A market has at most one active reward mint. Supply-share mutations settle
the lender's reward checkpoint first, preventing new lenders from claiming historical rewards.
