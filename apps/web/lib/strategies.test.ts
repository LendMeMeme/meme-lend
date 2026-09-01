import { describe, expect, it } from "vitest";
import { borrowAprAtUtilization, RATE_SCALE, validateRateCurve } from "@meme-lend/sdk";
import { recommendStrategy, strategies, strategyHref } from "./strategies";

describe("market strategies", () => {
  it("defines valid monotonic SDK curves", () => {
    for (const strategy of strategies) {
      expect(() => validateRateCurve(strategy.curve)).not.toThrow();
      expect(borrowAprAtUtilization(strategy.curve, RATE_SCALE)).toBe(strategy.curve.maxBorrowApr);
    }
  });
  it("recommends by collateral risk before audience priority", () => {
    expect(
      recommendStrategy({
        priority: "borrowers",
        collateralRisk: "very-high",
        initialLiquidity: 50_000,
      }),
    ).toBe("low-liquidity");
    expect(
      recommendStrategy({ priority: "lenders", collateralRisk: "lower", initialLiquidity: 50_000 }),
    ).toBe("protect-lenders");
    expect(
      recommendStrategy({ priority: "both", collateralRisk: "lower", initialLiquidity: 50_000 }),
    ).toBe("balanced");
  });
  it("creates review-only prefill links", () => {
    expect(strategyHref("borrower-friendly")).toBe("/create-market?strategy=borrower-friendly");
  });
});
