import { describe, expect, it } from "vitest";
import { evaluateHealth, observationIsFresh } from "./health.js";

describe("liquidator health", () => {
  it("rounds debt up and collateral value down", () => {
    const result = evaluateHealth({
      borrowShares: 2n,
      borrowIndex: 1_000_000_000_000_000_001n,
      collateralAmount: 1_000_000n,
      collateralDecimals: 6,
      price: 3_000_000_000_000_000_000n,
      priceDecimals: 18,
      lltvBps: 6_500,
      closeFactorBps: 5_000,
      maxRepay: 99n,
    });
    expect(result.debt).toBe(3n);
    expect(result.collateralValue).toBe(3n);
    expect(result.unhealthy).toBe(true);
    expect(result.requestedRepay).toBe(1n);
  });
  it("rejects future and stale observations", () => {
    expect(observationIsFresh(100n, 90n, 10)).toBe(true);
    expect(observationIsFresh(100n, 89n, 10)).toBe(false);
    expect(observationIsFresh(100n, 101n, 10)).toBe(false);
  });
});
