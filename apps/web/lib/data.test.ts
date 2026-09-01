import { afterEach, describe, expect, it, vi } from "vitest";
import { getMarkets, isMarketVisible } from "./data";

describe("indexer data boundary", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.INDEXER_API_URL;
  });

  it("hides retired markets from every discovery surface", () => {
    expect(isMarketVisible("4GQzSWWZjqteLwiinqgUdSYV8c3Fi4GEUqZRYYNBHvsw")).toBe(false);
    expect(isMarketVisible("FxVMAePA3sAF3D3ey16cNaKKo4YgKo42oUQv8vfCibBU")).toBe(false);
    expect(isMarketVisible("HkMsV74FdsAE88M4UyzFPBT8dtBsV3hApMPSKiKVcv48")).toBe(true);
  });

  it("joins an indexer base URL with a trailing slash safely", async () => {
    process.env.INDEXER_API_URL = "https://indexer.example/";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(getMarkets()).resolves.toEqual({ state: "ready", data: [] });
    expect(fetchMock).toHaveBeenCalledWith("https://indexer.example/markets", expect.any(Object));
  });

  it("fails closed when the indexer returns a non-array response", async () => {
    process.env.INDEXER_API_URL = "https://indexer.example";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    await expect(getMarkets()).resolves.toEqual({
      state: "unavailable",
      reason: "Indexer returned an invalid response",
    });
  });
});
