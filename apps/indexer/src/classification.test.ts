import { describe, expect, it } from "vitest";
import { classifyMarket, type RiskMetrics } from "./classification.js";
const base: RiskMetrics = {
  customOracle: false,
  oracleFresh: true,
  ageDays: 0,
  uniqueLenders: 0,
  suppliedUsdc: 0,
  collateralLiquidityUsd: null,
  badDebtUsdc: 0,
  manualCurated: false,
  restrictedReason: null,
};
describe("classification", () => {
  it("starts permissionless markets unverified", () =>
    expect(classifyMarket(base).status).toBe("Unverified"));
  it("never auto-establishes a custom oracle", () =>
    expect(
      classifyMarket({
        ...base,
        customOracle: true,
        ageDays: 100,
        uniqueLenders: 200,
        suppliedUsdc: 2_000_000,
      }).status,
    ).toBe("Community"));
  it("provides an exact restriction reason", () =>
    expect(
      classifyMarket({ ...base, restrictedReason: "Unsupported token behavior detected." })
        .reasons[0]?.detail,
    ).toContain("Unsupported"));
});
