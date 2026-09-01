import type { MarketView } from "@meme-lend/shared";
export type DataResult<T> = { state: "ready"; data: T } | { state: "unavailable"; reason: string };
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

export const getMarkets = () =>
  indexed<MarketView[]>(
    "/markets",
    (value): value is MarketView[] => Array.isArray(value) && value.every(isMarket),
  );
export const getMarket = (address: string) =>
  indexed<MarketView>(`/markets/${encodeURIComponent(address)}`, isMarket);
