import type { MarketView } from "@meme-lend/shared";
export type DataResult<T> = { state: "ready"; data: T } | { state: "unavailable"; reason: string };
async function indexed<T>(path: string): Promise<DataResult<T>> {
  const base = process.env.INDEXER_API_URL;
  if (!base) return { state: "unavailable", reason: "The indexer endpoint is not configured." };
  try {
    const response = await fetch(`${base}${path}`, { next: { revalidate: 15 } });
    if (!response.ok) throw new Error(`Indexer returned ${response.status}`);
    return { state: "ready", data: (await response.json()) as T };
  } catch (error) {
    return {
      state: "unavailable",
      reason: error instanceof Error ? error.message : "Indexer unavailable",
    };
  }
}
export const getMarkets = () => indexed<MarketView[]>("/markets");
export const getMarket = (address: string) =>
  indexed<MarketView>(`/markets/${encodeURIComponent(address)}`);
