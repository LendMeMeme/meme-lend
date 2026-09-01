import type { MarketStatus, StatusReason } from "@meme-lend/shared";
export interface RiskMetrics {
  customOracle: boolean;
  oracleFresh: boolean;
  ageDays: number;
  uniqueLenders: number;
  suppliedUsdc: number;
  collateralLiquidityUsd: number | null;
  badDebtUsdc: number;
  manualCurated: boolean;
  restrictedReason: string | null;
}
export function classifyMarket(metrics: RiskMetrics): {
  status: MarketStatus;
  reasons: StatusReason[];
} {
  if (metrics.restrictedReason)
    return {
      status: "Restricted",
      reasons: [{ code: "restricted", label: "Restricted", detail: metrics.restrictedReason }],
    };
  const reasons: StatusReason[] = [];
  if (
    metrics.manualCurated &&
    !metrics.customOracle &&
    metrics.oracleFresh &&
    metrics.badDebtUsdc === 0
  )
    return {
      status: "Curated",
      reasons: [
        {
          code: "manual-review",
          label: "Reviewed",
          detail:
            "A published governance review approved discovery eligibility; repayment is not guaranteed.",
        },
      ],
    };
  if (
    metrics.ageDays >= 90 &&
    metrics.uniqueLenders >= 100 &&
    metrics.suppliedUsdc >= 1_000_000 &&
    metrics.badDebtUsdc === 0 &&
    !metrics.customOracle &&
    metrics.oracleFresh
  )
    return {
      status: "Established",
      reasons: [
        {
          code: "history",
          label: "Established history",
          detail:
            "At least 90 days old, 100 lenders, $1m supplied, fresh oracle, and no indexed bad debt.",
        },
      ],
    };
  if (
    metrics.ageDays >= 14 &&
    metrics.uniqueLenders >= 20 &&
    metrics.suppliedUsdc >= 100_000 &&
    metrics.badDebtUsdc === 0 &&
    metrics.oracleFresh
  )
    return {
      status: "Community",
      reasons: [
        {
          code: "community-usage",
          label: "Community usage",
          detail:
            "At least 14 days old, 20 lenders, $100k supplied, fresh oracle, and no indexed bad debt.",
        },
        ...reasons,
      ],
    };
  return {
    status: "Unverified",
    reasons: [
      {
        code: "permissionless",
        label: "Unverified",
        detail:
          "Permissionlessly created and not reviewed; age, usage, or risk requirements are not met.",
      },
      ...reasons,
    ],
  };
}
