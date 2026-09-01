import { describe, expect, it } from "vitest";
import { requiredCollateralDeposit } from "./transactions";

describe("automatic borrow collateral", () => {
  it("rounds collateral up and targets a safety level below liquidation", () => {
    expect(
      requiredCollateralDeposit({
        resultingDebt: 1_000_000n,
        existingCollateral: 0n,
        collateralDecimals: 6,
        price: 2_000_000_000_000_000_000_000_000n,
        priceDecimals: 18,
        targetLtvBps: 4_000,
      }),
    ).toBe(1_250_000n);
  });

  it("uses existing collateral before requesting more", () => {
    expect(
      requiredCollateralDeposit({
        resultingDebt: 1_000_000n,
        existingCollateral: 1_000_000n,
        collateralDecimals: 6,
        price: 2_000_000_000_000_000_000_000_000n,
        priceDecimals: 18,
        targetLtvBps: 4_000,
      }),
    ).toBe(250_000n);
  });
});
