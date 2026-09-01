import { describe, expect, it } from "vitest";
import { marketTags, type MarketTagMetrics } from "./tags.js";

const base: MarketTagMetrics = {
  token2022: true,
  metadataAvailable: true,
  ageDays: 0,
  uniqueLenders: 1,
  suppliedUsdc: 2,
  borrowedUsdc: 0,
  utilizationBps: 0,
  collateralLiquidityUsd: null,
  firstLossReserveUsdc: 0,
  badDebtUsdc: 0,
  lltvBps: 5_000,
  rateModelId: 1,
  maxBorrowApr: 1_000_000_000_000_000_000n,
};

describe("market tags", () => {
  it("prioritizes the three most decision-relevant warnings", () => {
    const tags = marketTags(base);
    expect(tags.slice(0, 3).map((item) => item.code)).toEqual([
      "liquidity-data-unavailable",
      "small-usdc-pool",
      "reserve-empty",
    ]);
    expect(tags.some((item) => item.code.includes("oracle"))).toBe(false);
  });

  it("places bad debt and critical utilization first", () => {
    const tags = marketTags({
      ...base,
      borrowedUsdc: 1_950,
      suppliedUsdc: 2_000,
      utilizationBps: 9_750,
      badDebtUsdc: 10,
    });
    expect(tags.slice(0, 2).map((item) => item.code)).toEqual(["bad-debt", "critical-utilization"]);
  });

  it("classifies rates above 100% APR as experimental and high risk", () => {
    const tags = marketTags({ ...base, maxBorrowApr: 1_000_000_000_000_000_001n });
    expect(tags[0]?.code).toBe("extreme-rate-curve");
    expect(tags[0]?.tone).toBe("critical");
  });
});
