import { readFileSync } from "node:fs";
import { Keypair, PublicKey } from "@solana/web3.js";

export const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};

export function loadKeypair(): Keypair {
  const inline = process.env.ORACLE_KEYPAIR_JSON?.trim();
  const raw = inline ?? readFileSync(required("ORACLE_KEYPAIR_PATH"), "utf8");
  const secret = JSON.parse(raw) as unknown;
  if (
    !Array.isArray(secret) ||
    secret.length !== 64 ||
    secret.some((byte) => !Number.isInteger(byte))
  )
    throw new Error("Oracle keypair must be a 64-byte JSON array");
  return Keypair.fromSecretKey(Uint8Array.from(secret as number[]));
}

export type PublisherConfig = ReturnType<typeof publisherConfig>;

export function publisherConfig() {
  return {
    rpcHttp: required("SOLANA_RPC_HTTP"),
    programId: new PublicKey(required("PROGRAM_ID")),
    intervalMs: Number(process.env.ORACLE_INTERVAL_MS ?? "15000"),
    maxSourceDeviationBps: Number(process.env.ORACLE_MAX_SOURCE_DEVIATION_BPS ?? "500"),
    sourceMaxAgeSeconds: Number(process.env.ORACLE_SOURCE_MAX_AGE_SECONDS ?? "30"),
    liquidityHaircutBps: Number(process.env.ORACLE_LIQUIDITY_HAIRCUT_BPS ?? "200"),
    maxRecoverableUsdc: Number(process.env.ORACLE_MAX_RECOVERABLE_USDC ?? "25000"),
    minimumLiquidityUsd: Number(process.env.ORACLE_MINIMUM_LIQUIDITY_USD ?? "10000"),
    dexScreenerUrl: process.env.DEX_SCREENER_URL ?? "https://api.dexscreener.com",
    jupiterUrl: process.env.JUPITER_PRICE_URL ?? "https://api.jup.ag/price/v3",
    jupiterApiKey: process.env.JUPITER_API_KEY?.trim() || null,
    pythUrl: process.env.PYTH_HERMES_URL ?? "https://pyth.dourolabs.app/hermes",
    pythApiKey: process.env.PYTH_API_KEY?.trim() || null,
    pythFeedMap: parseFeedMap(process.env.PYTH_FEED_MAP_JSON),
    alertWebhookUrl: process.env.ALERT_WEBHOOK_URL?.trim() || null,
    standby: process.env.ORACLE_STANDBY === "true",
    failoverAfterSeconds: Number(process.env.ORACLE_FAILOVER_AFTER_SECONDS ?? "45"),
    minimumBalanceLamports: Number(process.env.ORACLE_MINIMUM_BALANCE_LAMPORTS ?? "20000000"),
    port: Number(process.env.PORT ?? "8790"),
  };
}

export function parseFeedMap(raw: string | undefined): ReadonlyMap<string, string> {
  if (!raw) return new Map();
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error(
      'PYTH_FEED_MAP_JSON must be valid JSON, for example {"<collateral-mint>":"<pyth-feed-id>"}',
    );
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("PYTH_FEED_MAP_JSON must be an object keyed by collateral mint");
  return new Map(
    Object.entries(value).map(([mint, feed]) => {
      let normalizedMint: string;
      try {
        normalizedMint = new PublicKey(mint.trim()).toBase58();
      } catch {
        throw new Error(`PYTH_FEED_MAP_JSON contains an invalid collateral mint: ${mint}`);
      }
      const normalizedFeed = String(feed).trim().replace(/^0x/, "");
      if (!/^[0-9a-fA-F]{64}$/.test(normalizedFeed))
        throw new Error(
          `PYTH_FEED_MAP_JSON contains an invalid Pyth feed ID for ${normalizedMint}`,
        );
      return [normalizedMint, normalizedFeed];
    }),
  );
}

export function assertConfig(config: PublisherConfig): void {
  if (!Number.isInteger(config.intervalMs) || config.intervalMs < 5_000)
    throw new Error("ORACLE_INTERVAL_MS must be at least 5000");
  for (const [label, value] of [
    ["ORACLE_MAX_SOURCE_DEVIATION_BPS", config.maxSourceDeviationBps],
    ["ORACLE_LIQUIDITY_HAIRCUT_BPS", config.liquidityHaircutBps],
  ] as const)
    if (!Number.isInteger(value) || value <= 0 || value > 10_000)
      throw new Error(`${label} must be between 1 and 10000`);
  if (config.minimumLiquidityUsd <= 0 || config.maxRecoverableUsdc <= 0)
    throw new Error("Liquidity thresholds must be positive");
  if (!Number.isInteger(config.sourceMaxAgeSeconds) || config.sourceMaxAgeSeconds < 5)
    throw new Error("ORACLE_SOURCE_MAX_AGE_SECONDS must be at least 5");
  if (!Number.isInteger(config.failoverAfterSeconds) || config.failoverAfterSeconds < 15)
    throw new Error("ORACLE_FAILOVER_AFTER_SECONDS must be at least 15");
  if (!Number.isInteger(config.minimumBalanceLamports) || config.minimumBalanceLamports < 0)
    throw new Error("ORACLE_MINIMUM_BALANCE_LAMPORTS must be a non-negative integer");
}
