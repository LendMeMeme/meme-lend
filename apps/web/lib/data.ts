import type { MarketView } from "@meme-lend/shared";
export type DataResult<T> = { state: "ready"; data: T } | { state: "unavailable"; reason: string };

const DEFAULT_HIDDEN_MARKETS = new Set([
  "4GQzSWWZjqteLwiinqgUdSYV8c3Fi4GEUqZRYYNBHvsw",
  "FxVMAePA3sAF3D3ey16cNaKKo4YgKo42oUQv8vfCibBU",
]);

export function isMarketVisible(address: string): boolean {
  const configured = (process.env.HIDDEN_MARKETS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return !DEFAULT_HIDDEN_MARKETS.has(address) && !configured.includes(address);
}
async function indexed<T>(
  path: string,
  validate: (value: unknown) => value is T,
): Promise<DataResult<T>> {
  const base = process.env.INDEXER_API_URL;
  if (!base) return { state: "unavailable", reason: "The indexer endpoint is not configured." };
  try {
    const response = await fetch(`${base.replace(/\/+$/, "")}${path}`, {
      next: { revalidate: 15 },
    });
    if (!response.ok) throw new Error(`Indexer returned ${response.status}`);
    const value: unknown = await response.json();
    if (!validate(value)) throw new Error("Indexer returned an invalid response");
    return { state: "ready", data: value };
  } catch (error) {
    return {
      state: "unavailable",
      reason: error instanceof Error ? error.message : "Indexer unavailable",
    };
  }
}

const isMarket = (value: unknown): value is MarketView =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { address?: unknown }).address === "string";

export const getMarkets = async (): Promise<DataResult<MarketView[]>> => {
  const result = await indexed<MarketView[]>(
    "/markets",
    (value): value is MarketView[] => Array.isArray(value) && value.every(isMarket),
  );
  return result.state === "ready"
    ? { state: "ready", data: result.data.filter((market) => isMarketVisible(market.address)) }
    : result;
};
export const getMarket = (address: string) =>
  indexed<MarketView>(`/markets/${encodeURIComponent(address)}`, isMarket);
