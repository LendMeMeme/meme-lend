import { describe, expect, it } from "vitest";
import type { MarketView } from "@meme-lend/shared";
import {
  currentRateRisk,
  hasActiveBorrowing,
  homepageSections,
  isRecentlyCreated,
  liquidityTier,
  sortMarkets,
} from "./market-discovery";

const market = (address: string, supplied: string, borrowed = "0", apr = 0): MarketView => ({
  address,
  collateralMint: address,
  collateralName: null,
  collateralSymbol: null,
  loanMint: address,
  creator: address,
  status: "Community",
  statusReasons: [],
  oracleKind: "Custom",
  customOracleHighRisk: true,
  lltvBps: 5000,
  supplyAprBps: apr,
  borrowAprBps: apr,
  suppliedUsdc: supplied,
  borrowedUsdc: borrowed,
  availableUsdc: supplied,
  utilizationBps: 0,
  firstLossReserve: "0",
  badDebt: "0",
  oraclePublishedAt: null,
  collateralLiquidityUsd: null,
  estimatedSellSlippageBps: null,
  slot: Number(address),
  updatedAt: new Date(0).toISOString(),
});

describe("market discovery", () => {
  it("classifies every liquidity boundary", () => {
    expect(
      [0, 1, 100, 1_000, 10_000].map((n) => liquidityTier(market("1", String(n * 1e6)))),
    ).toEqual(["none", "limited", "early", "growing", "established"]);
  });
  it("uses real debt and current rates", () => {
    expect(hasActiveBorrowing(market("1", "1", "1"))).toBe(true);
    expect(currentRateRisk(market("1", "1", "0", 100_001))).toBe("extreme");
  });
  it("sorts stably and removes homepage duplicates", () => {
    const values = [market("1", "10"), market("2", "30", "2"), market("3", "20")];
    expect(sortMarkets(values, "liquidity").map((m) => m.address)).toEqual(["2", "3", "1"]);
    const sections = homepageSections(values);
    expect(
      new Set(
        Object.values(sections)
          .flat()
          .map((m) => m.address),
      ).size,
    ).toBe(3);
  });
  it("requires a known recent creation time for the new section", () => {
    const now = Date.parse("2026-09-01T12:00:00.000Z");
    const unknown = market("1", "10");
    const recent = { ...market("2", "10"), createdAt: "2026-08-31T12:00:00.000Z" };
    expect(isRecentlyCreated(unknown, now)).toBe(false);
    expect(isRecentlyCreated(recent, now)).toBe(true);
  });
});
