import { describe, expect, it } from "vitest";
import { RATE_SCALE } from "@meme-lend/sdk";
import { previewAccruedBorrowState, requiredCollateralDeposit } from "./transactions";

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

  it("includes unrecorded interest before checking a subsequent borrow", () => {
    const preview = previewAccruedBorrowState({
      cash: 2_000_000n,
      totalDebt: 1_000_000n,
      totalBorrowShares: 1_000_000n,
      borrowIndex: RATE_SCALE,
      lastAccrualTimestamp: 1_000n,
      now: 1_900n,
      rateCurve: {
        startBorrowApr: 10n * RATE_SCALE,
        targetUtilizationBps: 9000,
        targetBorrowApr: 10n * RATE_SCALE,
        maxBorrowApr: 10n * RATE_SCALE,
        aboveTargetShape: 1,
      },
    });
    expect(preview.borrowIndex).toBeGreaterThan(RATE_SCALE);
    expect(preview.totalDebt).toBeGreaterThan(1_000_000n);
  });
});
