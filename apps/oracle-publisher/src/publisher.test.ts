import { describe, expect, it } from "vitest";
import { shouldStartOracleRefresh } from "./publisher.js";

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
