import type { PublisherConfig } from "./config.js";

export type PriceSample = {
  source: string;
  priceUsd: number;
  confidenceBps: number;
  publishedAt: number;
};

export type PriceResult = {
  priceUsd: number;
  confidenceBps: number;
  deviationBps: number;
  liquidityUsd: number;
  sources: string[];
};

const finitePositive = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

async function requestJson(url: string, headers?: HeadersInit): Promise<unknown> {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error(`${new URL(url).hostname} returned ${response.status}`);
  return response.json();
}

export async function dexScreenerSample(
  mint: string,
  config: PublisherConfig,
): Promise<{ sample: PriceSample; liquidityUsd: number }> {
  const raw = (await requestJson(
    `${config.dexScreenerUrl}/token-pairs/v1/solana/${encodeURIComponent(mint)}`,
  )) as unknown;
  if (!Array.isArray(raw)) throw new Error("DEX Screener returned an invalid payload");
  const byDex = new Map<string, { price: number; liquidity: number }>();
  for (const pair of raw) {
    if (!pair || typeof pair !== "object") continue;
    const item = pair as Record<string, unknown>;
    const price = finitePositive(item.priceUsd);
    const liquidity = finitePositive((item.liquidity as Record<string, unknown> | undefined)?.usd);
    const dex = typeof item.dexId === "string" ? item.dexId : null;
    if (!price || !liquidity || !dex) continue;
    const current = byDex.get(dex);
    if (!current || liquidity > current.liquidity) byDex.set(dex, { price, liquidity });
  }
  const pools = [...byDex.values()].sort((a, b) => b.liquidity - a.liquidity).slice(0, 5);
  const liquidityUsd = pools.reduce((sum, pool) => sum + pool.liquidity, 0);
  if (pools.length < 2 || liquidityUsd < config.minimumLiquidityUsd)
    throw new Error("Collateral lacks two independent liquid DEX venues");
  const priceUsd = weightedMedian(pools.map((pool) => [pool.price, pool.liquidity]));
  const spread = spreadBps(
    pools.map((pool) => pool.price),
    priceUsd,
  );
  return {
    sample: {
      source: "dex-screener-multidex",
      priceUsd,
      confidenceBps: spread,
      publishedAt: Math.floor(Date.now() / 1000),
    },
    liquidityUsd,
  };
}

export async function jupiterSample(mint: string, config: PublisherConfig): Promise<PriceSample> {
  if (!config.jupiterApiKey) throw new Error("Jupiter API key unavailable");
  const raw = (await requestJson(`${config.jupiterUrl}?ids=${encodeURIComponent(mint)}`, {
    "x-api-key": config.jupiterApiKey,
  })) as Record<string, unknown>;
  const item = raw[mint] as Record<string, unknown> | undefined;
  const priceUsd = finitePositive(item?.usdPrice ?? item?.price);
  if (!priceUsd) throw new Error("Jupiter returned no usable price");
  return { source: "jupiter", priceUsd, confidenceBps: 100, publishedAt: Date.now() / 1000 };
}

export async function pythSample(mint: string, config: PublisherConfig): Promise<PriceSample> {
  const feed = config.pythFeedMap.get(mint);
  if (!feed || !config.pythApiKey) throw new Error("Pyth feed or API key unavailable");
  const raw = (await requestJson(`${config.pythUrl}/v2/updates/price/latest?ids[]=${feed}`, {
    Authorization: `Bearer ${config.pythApiKey}`,
  })) as { parsed?: Array<{ price?: Record<string, unknown> }> };
  const price = raw.parsed?.[0]?.price;
  const integer = finitePositive(price?.price);
  const confidence = finitePositive(price?.conf);
  const exponent = Number(price?.expo);
  const publishedAt = Number(price?.publish_time);
  if (!integer || !confidence || !Number.isInteger(exponent) || !Number.isInteger(publishedAt))
    throw new Error("Pyth returned an invalid price");
  const priceUsd = integer * 10 ** exponent;
  const confidenceBps = Math.ceil((confidence / integer) * 10_000);
  return { source: "pyth", priceUsd, confidenceBps, publishedAt };
}

export async function aggregatePrice(mint: string, config: PublisherConfig): Promise<PriceResult> {
  const [dex, jupiter, pyth] = await Promise.allSettled([
    dexScreenerSample(mint, config),
    jupiterSample(mint, config),
    pythSample(mint, config),
  ]);
  if (dex.status !== "fulfilled") throw new Error(`Liquidity source failed: ${dex.reason}`);
  const samples = [dex.value.sample];
  if (jupiter.status === "fulfilled") samples.push(jupiter.value);
  if (pyth.status === "fulfilled") samples.push(pyth.value);
  if (samples.length < 2) throw new Error("Fewer than two independent price sources are available");
  const now = Math.floor(Date.now() / 1000);
  const fresh = samples.filter(
    (sample) => sample.publishedAt <= now && now - sample.publishedAt <= config.sourceMaxAgeSeconds,
  );
  if (fresh.length < 2)
    throw new Error("Fewer than two fresh independent price sources are available");
  const priceUsd = median(fresh.map((sample) => sample.priceUsd));
  const deviationBps = spreadBps(
    fresh.map((sample) => sample.priceUsd),
    priceUsd,
  );
  if (deviationBps > config.maxSourceDeviationBps)
    throw new Error(`Price sources disagree by ${deviationBps} bps`);
  return {
    priceUsd,
    confidenceBps: Math.max(deviationBps, ...fresh.map((sample) => sample.confidenceBps)),
    deviationBps,
    liquidityUsd: dex.value.liquidityUsd,
    sources: fresh.map((sample) => sample.source),
  };
}

export function median(values: number[]): number {
  if (values.length === 0) throw new Error("Cannot calculate an empty median");
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

export function weightedMedian(values: Array<[number, number]>): number {
  const sorted = [...values].sort((a, b) => a[0] - b[0]);
  const half = sorted.reduce((sum, [, weight]) => sum + weight, 0) / 2;
  let cumulative = 0;
  for (const [value, weight] of sorted) {
    cumulative += weight;
    if (cumulative >= half) return value;
  }
  throw new Error("Cannot calculate weighted median");
}

export function spreadBps(values: number[], center: number): number {
  return Math.ceil(
    (Math.max(...values.map((value) => Math.abs(value - center))) / center) * 10_000,
  );
}
