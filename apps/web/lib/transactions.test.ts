import { describe, expect, it } from "vitest";
import { RATE_SCALE } from "@meme-lend/sdk";
import {
  limitingBorrowReason,
  previewAccruedBorrowState,
  requiredCollateralDeposit,
  withdrawSharesForAssets,
} from "./transactions";

describe("USDC withdrawal conversion", () => {
  it("converts a normal USDC amount to shares with conservative rounding", () => {
    const assets = 100_000_000n;
    const totalAssets = 200_000_000n;
    const totalShares = 100_000_000n;
    const shares = withdrawSharesForAssets({ assets, totalAssets, totalShares });
    const numerator = totalAssets + 1_000_000n;
    const denominator = totalShares + 1_000_000n;
    expect((shares * numerator) / denominator).toBeGreaterThanOrEqual(assets);
    expect(((shares - 1n) * numerator) / denominator).toBeLessThan(assets);
  });
});

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

describe("borrow limit explanations", () => {
  const reason = (overrides: Partial<Parameters<typeof limitingBorrowReason>[0]>) =>
    limitingBorrowReason({
      maximum: 10n,
      available: 20n,
      marketRemaining: 30n,
      walletRemaining: 40n,
      oracleRemaining: 10n,
      ...overrides,
    });

  it("identifies oracle recoverability as the limiting constraint", () => {
    expect(reason({})).toBe("ORACLE_LIQUIDITY");
  });

  it("identifies market cash, market cap, and wallet cap constraints", () => {
    expect(reason({ available: 10n, oracleRemaining: 50n })).toBe("AVAILABLE_LIQUIDITY");
    expect(reason({ marketRemaining: 10n, oracleRemaining: 50n })).toBe("MARKET_CAP");
    expect(reason({ walletRemaining: 10n, oracleRemaining: 50n })).toBe("WALLET_CAP");
  });
});
