import { describe, expect, it } from "vitest";
import { median, spreadBps, weightedMedian } from "./pricing.js";
import { usdPriceToOracle } from "./publisher.js";

describe("oracle aggregation math", () => {
  it("uses a median that resists one outlier", () => {
    expect(median([1, 1.01, 40])).toBe(1.01);
  });
  it("weights the DEX median by executable liquidity", () => {
    expect(
      weightedMedian([
        [0.2, 100],
        [1, 10_000],
        [8, 50],
      ]),
    ).toBe(1);
  });
  it("rounds deviation against publication", () => {
    expect(spreadBps([0.99, 1.01], 1)).toBe(101);
  });
  it("converts USD prices to USDC atomic units with oracle precision", () => {
    expect(usdPriceToOracle(1.25, 24)).toBe(1_250_000_000_000_000_000_000_000n);
    expect(usdPriceToOracle(0.000000000001, 24)).toBe(1_000_000_000_000n);
  });
});
