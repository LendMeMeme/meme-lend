import { describe, expect, it } from "vitest";
import {
  effectiveRefreshLead,
  oraclePublicationTimestamp,
  oraclePriceDeviationBps,
  publishingPriority,
  shouldStartOracleRefresh,
} from "./publisher.js";

describe("two-publisher refresh scheduling", () => {
  it("uses Solana time and never moves a pending round backward", () => {
    expect(oraclePublicationTimestamp(1_000)).toBe(1_000);
    expect(oraclePublicationTimestamp(1_000, 1_001n)).toBe(1_001);
    expect(() => oraclePublicationTimestamp(0)).toThrow("invalid block timestamp");
  });

  it("keeps a confirmed observation usable for most of its valid lifetime", () => {
    expect(shouldStartOracleRefresh(10, 60, 20)).toBe(false);
    expect(shouldStartOracleRefresh(39, 60, 20)).toBe(false);
  });

  it("starts a replacement round before the observation expires", () => {
    expect(shouldStartOracleRefresh(40, 60, 20)).toBe(true);
    expect(shouldStartOracleRefresh(60, 60, 20)).toBe(true);
  });

  it("reserves enough confirmation time for short immutable windows", () => {
    expect(effectiveRefreshLead(60, 20)).toBe(40);
    expect(effectiveRefreshLead(120, 20)).toBe(80);
  });
});

describe("cross-publisher price diagnostics", () => {
  it("rounds disagreement conservatively in basis points", () => {
    expect(oraclePriceDeviationBps(100n, 105n)).toBe(500);
    expect(oraclePriceDeviationBps(100n, 101n)).toBe(100);
    expect(oraclePriceDeviationBps(101n, 100n)).toBe(100);
  });

  it("rejects a zero comparison price", () => {
    expect(() => oraclePriceDeviationBps(0n, 100n)).toThrow("zero oracle price");
  });
});

describe("publisher queue priority", () => {
  it("puts backup confirmations ahead of ordinary scanning", () => {
    expect(
      publishingPriority({
        sourceIndex: 1,
        hasObservation: true,
        pendingConfirmation: true,
        stale: false,
      }),
    ).toBe(0);
  });

  it("lets the primary restart missing or stale rounds first", () => {
    expect(
      publishingPriority({
        sourceIndex: 0,
        hasObservation: false,
        pendingConfirmation: false,
        stale: false,
      }),
    ).toBe(0);
    expect(
      publishingPriority({
        sourceIndex: 1,
        hasObservation: true,
        pendingConfirmation: false,
        stale: true,
      }),
    ).toBe(3);
  });
});
