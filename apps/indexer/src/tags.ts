import type { MarketTag } from "@meme-lend/shared";

export interface MarketTagMetrics {
  token2022: boolean;
  metadataAvailable: boolean;
  ageDays: number;
  uniqueLenders: number;
  suppliedUsdc: number;
  borrowedUsdc: number;
  utilizationBps: number;
  collateralLiquidityUsd: number | null;
  firstLossReserveUsdc: number;
  badDebtUsdc: number;
  lltvBps: number;
  rateModelId: number;
  maxBorrowApr: bigint;
}

const tag = (
  code: string,
  label: string,
  detail: string,
  tone: MarketTag["tone"],
  priority: number,
): MarketTag => ({ code, label, detail, tone, priority });

export function marketTags(metrics: MarketTagMetrics): MarketTag[] {
  const tags: MarketTag[] = [];

  if (metrics.maxBorrowApr > 1_000_000_000_000_000_000n)
    tags.push(
      tag(
        "extreme-rate-curve",
        "Experimental / high-risk rates",
        "The immutable maximum borrowing APR is above 100%. Very high borrowing cost can grow debt quickly; lender APR remains variable and is not guaranteed.",
        "critical",
        1,
      ),
    );

  if (metrics.badDebtUsdc > 0)
    tags.push(
      tag(
        "bad-debt",
        "Bad debt recorded",
        `${metrics.badDebtUsdc.toLocaleString()} USDC of debt was not covered by collateral or reserves.`,
        "critical",
        0,
      ),
    );
  else
    tags.push(
      tag(
        "no-bad-debt",
        "No recorded bad debt",
        "No finalized lender loss is currently recorded. This does not guarantee future safety.",
        "positive",
        160,
      ),
    );

  if (!metrics.metadataAvailable)
    tags.push(
      tag(
        "metadata-unavailable",
        "Token identity incomplete",
        "The token name or symbol could not be verified from its on-chain metadata.",
        "warning",
        10,
      ),
    );
  else
    tags.push(
      tag(
        "token-identity",
        "Token identity verified",
        "The displayed token identity was decoded from metadata associated with this mint.",
        "positive",
        145,
      ),
    );

  if (metrics.suppliedUsdc === 0)
    tags.push(
      tag(
        "no-usdc-liquidity",
        "No USDC liquidity",
        "There is currently no lender USDC available in this market.",
        "critical",
        5,
      ),
    );
  else if (metrics.suppliedUsdc < 1_000)
    tags.push(
      tag(
        "small-usdc-pool",
        "Very small USDC pool",
        "The market has less than 1,000 USDC supplied, so one action can materially change rates and availability.",
        "warning",
        25,
      ),
    );

  if (metrics.collateralLiquidityUsd === null)
    tags.push(
      tag(
        "liquidity-data-unavailable",
        "Collateral liquidity unknown",
        "Reliable DEX liquidity and liquidation-slippage data are not currently available.",
        "warning",
        15,
      ),
    );

  if (metrics.utilizationBps >= 9_500)
    tags.push(
      tag(
        "critical-utilization",
        "Almost all USDC borrowed",
        "At least 95% of supplied USDC is in use, so lender withdrawals may be severely limited.",
        "critical",
        8,
      ),
    );
  else if (metrics.utilizationBps >= 8_000)
    tags.push(
      tag(
        "high-utilization",
        "High utilization",
        "At least 80% of supplied USDC is borrowed. Rates and withdrawal constraints may be elevated.",
        "warning",
        20,
      ),
    );
  else if (metrics.borrowedUsdc === 0)
    tags.push(
      tag(
        "no-active-borrowing",
        "No active borrowing",
        "No USDC is borrowed, so lenders currently earn no borrower interest.",
        "neutral",
        45,
      ),
    );
  else
    tags.push(
      tag(
        "active-market",
        "Active borrowing",
        "Borrowers are currently using part of the supplied USDC.",
        "positive",
        135,
      ),
    );

  if (metrics.firstLossReserveUsdc === 0)
    tags.push(
      tag(
        "reserve-empty",
        "First-loss reserve empty",
        "No dedicated USDC reserve is available to absorb bad debt before lenders take a loss.",
        "warning",
        30,
      ),
    );
  else {
    const coverage =
      metrics.borrowedUsdc === 0 ? null : metrics.firstLossReserveUsdc / metrics.borrowedUsdc;
    tags.push(
      tag(
        coverage !== null && coverage < 0.1 ? "low-reserve" : "reserve-funded",
        coverage !== null && coverage < 0.1 ? "Low reserve coverage" : "Reserve funded",
        coverage === null
          ? `${metrics.firstLossReserveUsdc.toLocaleString()} USDC is held in the first-loss reserve.`
          : `The reserve covers approximately ${(coverage * 100).toFixed(1)}% of current debt.`,
        coverage !== null && coverage < 0.1 ? "warning" : "positive",
        coverage !== null && coverage < 0.1 ? 28 : 120,
      ),
    );
  }

  if (metrics.ageDays < 14)
    tags.push(
      tag(
        "new-market",
        "New market",
        "This market has less than 14 days of operating history.",
        "warning",
        35,
      ),
    );
  else if (metrics.ageDays >= 90)
    tags.push(
      tag(
        "market-history",
        "90+ day history",
        "This market has at least 90 days of indexed operating history.",
        "positive",
        130,
      ),
    );

  if (metrics.uniqueLenders < 5)
    tags.push(
      tag(
        "few-lenders",
        "Few lenders",
        "Fewer than five distinct lender wallets have supplied this market.",
        "warning",
        40,
      ),
    );

  if (metrics.lltvBps >= 6_000)
    tags.push(
      tag(
        "high-lltv",
        "Higher leverage",
        "The liquidation threshold gives borrowers more leverage and leaves a smaller price buffer.",
        "warning",
        50,
      ),
    );
  else
    tags.push(
      tag(
        "conservative-lltv",
        "Conservative leverage",
        "The liquidation threshold limits borrowing power to preserve a larger collateral buffer.",
        "positive",
        150,
      ),
    );

  tags.push(
    tag(
      metrics.rateModelId === 1
        ? "lender-protective-rate"
        : metrics.rateModelId === 0
          ? "borrower-friendly-rate"
          : "custom-rate-curve",
      metrics.rateModelId === 1
        ? "Lender-protective rates"
        : metrics.rateModelId === 0
          ? "Borrower-friendly rates"
          : "Custom rate curve",
      metrics.rateModelId === 1
        ? "Borrow rates rise sooner and more sharply when available USDC becomes scarce."
        : metrics.rateModelId === 0
          ? "Borrow rates begin lower and rise more gradually before the utilization target."
          : "The market creator selected immutable custom borrowing-rate parameters.",
      "neutral",
      140,
    ),
  );

  if (metrics.token2022)
    tags.push(
      tag(
        "token-2022",
        "Token-2022",
        "This collateral uses the Token-2022 program and passed the protocol extension allowlist.",
        "neutral",
        155,
      ),
    );

  return tags.sort(
    (left, right) => left.priority - right.priority || left.code.localeCompare(right.code),
  );
}
