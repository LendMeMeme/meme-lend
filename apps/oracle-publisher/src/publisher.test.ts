import { describe, expect, it } from "vitest";
import { publishingPriority, shouldStartOracleRefresh } from "./publisher.js";

describe("two-publisher refresh scheduling", () => {
  it("keeps a confirmed observation usable for most of its valid lifetime", () => {
    expect(shouldStartOracleRefresh(10, 60, 20)).toBe(false);
    expect(shouldStartOracleRefresh(39, 60, 20)).toBe(false);
  });

  it("starts a replacement round before the observation expires", () => {
    expect(shouldStartOracleRefresh(40, 60, 20)).toBe(true);
    expect(shouldStartOracleRefresh(60, 60, 20)).toBe(true);
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
