import { describe, expect, it } from "vitest";
import { parseFeedMap } from "./config.js";

const mint = "MukLDtJ8Cx9DxLbeyLRSWPSposTMWuwHANbuaudpump";
const feed = "a".repeat(64);

describe("publisher feed-map configuration", () => {
  it("allows an empty map when a collateral has no Pyth feed", () => {
    expect(parseFeedMap("{}").size).toBe(0);
  });

  it("accepts collateral-mint to Pyth-feed mappings", () => {
    expect(parseFeedMap(JSON.stringify({ [mint]: `0x${feed}` })).get(mint)).toBe(feed);
  });

  it("identifies an invalid collateral key", () => {
    expect(() => parseFeedMap(JSON.stringify({ "not a mint": feed }))).toThrow(
      "invalid collateral mint",
    );
  });

  it("identifies an invalid feed ID", () => {
    expect(() => parseFeedMap(JSON.stringify({ [mint]: "not-a-feed" }))).toThrow(
      "invalid Pyth feed ID",
    );
  });
});
