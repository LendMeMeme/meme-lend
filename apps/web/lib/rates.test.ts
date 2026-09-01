import { describe, expect, it } from "vitest";
import { amountEstimate, formatApr, periodRateFromApr } from "./rates";

describe("APR presentation", () => {
  it("derives simple period estimates without presenting compounded APY", () => {
    expect(periodRateFromApr(1_000, 365)).toBeCloseTo(0.1);
    expect(periodRateFromApr(1_000, 30)).toBeCloseTo((0.1 * 30) / 365);
  });

  it("turns the current APR into an amount-based estimate", () => {
    expect(amountEstimate(1_000, 1_000, 30)).toBeCloseTo(8.219178);
  });

  it("does not invent unavailable rates", () => {
    expect(formatApr(null)).toBe("Unavailable");
  });
});
