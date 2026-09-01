import type { MarketView } from "@meme-lend/shared";

const atomic = (value: string | null | undefined) => BigInt(value ?? "0");

export type LiquidityTier = "established" | "growing" | "early" | "limited" | "none";
export function liquidityTier(market: MarketView): LiquidityTier {
  const supplied = atomic(market.suppliedUsdc);
  if (supplied >= 10_000_000_000n) return "established";
  if (supplied >= 1_000_000_000n) return "growing";
  if (supplied >= 100_000_000n) return "early";
  return supplied > 0n ? "limited" : "none";
}

export const hasActiveBorrowing = (market: MarketView) => atomic(market.borrowedUsdc) > 0n;
export const isRecentlyCreated = (market: MarketView, now = Date.now()) => {
  if (!market.createdAt) return false;
  const created = Date.parse(market.createdAt);
  return Number.isFinite(created) && created <= now && now - created <= 14 * 86_400_000;
};
export const currentRateRisk = (market: MarketView) => {
  const apr = market.borrowAprBps ?? 0;
  if (apr > 1_000_000) return "experimental";
  if (apr > 100_000) return "extreme";
  if (apr > 10_000) return "very-high";
  return null;
};

export type MarketSort = "liquidity" | "lender-apr" | "borrowed" | "borrower-apr" | "newest";
export function sortMarkets(markets: MarketView[], sort: MarketSort): MarketView[] {
  return markets
    .map((market, index) => ({ market, index }))
    .sort((left, right) => {
      const a = left.market,
        b = right.market;
      let order = 0;
      if (sort === "liquidity")
        order =
          atomic(b.suppliedUsdc) > atomic(a.suppliedUsdc)
            ? 1
            : atomic(b.suppliedUsdc) < atomic(a.suppliedUsdc)
              ? -1
              : 0;
      if (sort === "lender-apr") order = (b.supplyAprBps ?? -1) - (a.supplyAprBps ?? -1);
      if (sort === "borrowed")
        order =
          atomic(b.borrowedUsdc) > atomic(a.borrowedUsdc)
            ? 1
            : atomic(b.borrowedUsdc) < atomic(a.borrowedUsdc)
              ? -1
              : 0;
      if (sort === "newest") order = (b.createdSlot ?? b.slot) - (a.createdSlot ?? a.slot);
      if (sort === "borrower-apr") {
        const aReady = atomic(a.maxBorrowableUsdc) > 0n,
          bReady = atomic(b.maxBorrowableUsdc) > 0n;
        order =
          aReady !== bReady
            ? aReady
              ? -1
              : 1
            : (a.borrowAprBps ?? Infinity) - (b.borrowAprBps ?? Infinity);
      }
      return order || left.index - right.index;
    })
    .map(({ market }) => market);
}

export function homepageSections(markets: MarketView[], now = Date.now()) {
  const used = new Set<string>();
  const take = (candidates: MarketView[]) =>
    candidates
      .filter((market) => !used.has(market.address))
      .slice(0, 4)
      .map((market) => {
        used.add(market.address);
        return market;
      });
  return {
    liquid: take(sortMarkets(markets, "liquidity")),
    active: take(sortMarkets(markets.filter(hasActiveBorrowing), "borrowed")),
    new: take(
      sortMarkets(
        markets.filter((market) => isRecentlyCreated(market, now)),
        "newest",
      ),
    ),
    experimental: take(markets.filter((market) => currentRateRisk(market) !== null)),
  };
}
