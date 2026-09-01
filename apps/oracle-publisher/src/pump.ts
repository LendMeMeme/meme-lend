import { Connection, PublicKey } from "@solana/web3.js";
import type { PublisherConfig } from "./config.js";
import type { PriceResult } from "./pricing.js";

export const PUMP_PROGRAM_ID = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
export const PUMP_CURVE_DISCRIMINATOR = Uint8Array.from([23, 183, 248, 55, 96, 216, 172, 96]);
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const WSOL = "So11111111111111111111111111111111111111112";

export type PumpCurve = {
  virtualTokenReserves: bigint;
  virtualQuoteReserves: bigint;
  realTokenReserves: bigint;
  realQuoteReserves: bigint;
  complete: boolean;
  quoteMint: PublicKey;
};

export function decodePumpCurve(data: Uint8Array): PumpCurve {
  if (data.length < 115 || !PUMP_CURVE_DISCRIMINATOR.every((value, i) => data[i] === value))
    throw new Error("Pump bonding curve has invalid account data");
  const view = Buffer.from(data);
  const curve = {
    virtualTokenReserves: view.readBigUInt64LE(8),
    virtualQuoteReserves: view.readBigUInt64LE(16),
    realTokenReserves: view.readBigUInt64LE(24),
    realQuoteReserves: view.readBigUInt64LE(32),
    complete: view[48] !== 0,
    quoteMint: new PublicKey(view.subarray(83, 115)),
  };
  if (
    curve.virtualTokenReserves === 0n ||
    curve.virtualQuoteReserves === 0n ||
    curve.realTokenReserves === 0n ||
    curve.realQuoteReserves === 0n
  )
    throw new Error("Pump bonding curve has zero reserves");
  return curve;
}

export function pumpSellQuote(curve: PumpCurve, amount: bigint): bigint {
  if (amount <= 0n) throw new Error("Pump quote amount must be positive");
  const output = (amount * curve.virtualQuoteReserves) / (curve.virtualTokenReserves + amount);
  return output < curve.realQuoteReserves ? output : curve.realQuoteReserves;
}

type JupiterQuote = {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  otherAmountThreshold: string;
  priceImpactPct?: string;
  routePlan?: Array<{
    swapInfo?: { label?: string; ammKey?: string; inputMint?: string; outputMint?: string };
  }>;
};

async function quote(
  inputMint: string,
  outputMint: string,
  amount: bigint,
  config: PublisherConfig,
) {
  if (!config.jupiterApiKey) throw new Error("Jupiter API key unavailable");
  const url = new URL(config.jupiterQuoteUrl);
  for (const [key, value] of Object.entries({
    inputMint,
    outputMint,
    amount: amount.toString(),
    swapMode: "ExactIn",
    slippageBps: String(config.maxJupiterPriceImpactBps),
  }))
    url.searchParams.set(key, value);
  let response: Response | null = null;
  for (const delay of [0, 400, 1_000]) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    response = await fetch(url, {
      headers: { "x-api-key": config.jupiterApiKey },
      signal: AbortSignal.timeout(8_000),
    });
    if (response.status !== 429) break;
  }
  if (!response?.ok) throw new Error(`Jupiter quote returned ${response?.status ?? "no response"}`);
  const value = (await response.json()) as JupiterQuote;
  if (
    value.inputMint !== inputMint ||
    value.outputMint !== outputMint ||
    value.inAmount !== amount.toString() ||
    !/^\d+$/.test(value.otherAmountThreshold) ||
    BigInt(value.otherAmountThreshold) === 0n
  )
    throw new Error("Jupiter returned an invalid executable quote");
  const impactBps = Math.ceil(Number(value.priceImpactPct ?? "1") * 10_000);
  if (!Number.isFinite(impactBps) || impactBps > config.maxJupiterPriceImpactBps)
    throw new Error(`Jupiter price impact ${impactBps} bps exceeds the safety limit`);
  if (!value.routePlan?.length) throw new Error("Jupiter returned an empty route");
  return value;
}

export function integerDeviationBps(left: bigint, right: bigint): number {
  const denominator = left < right ? left : right;
  if (denominator === 0n) throw new Error("Cannot compare a zero quote");
  const difference = left > right ? left - right : right - left;
  return Number((difference * 10_000n + denominator - 1n) / denominator);
}

export async function pumpBondingCurvePrice(
  connection: Connection,
  mint: string,
  marketLltvBps: number,
  config: PublisherConfig,
): Promise<PriceResult> {
  if (!config.enableSingleVenueMode) throw new Error("Pump single-venue mode is disabled");
  const mintKey = new PublicKey(mint);
  const [curveKey] = PublicKey.findProgramAddressSync(
    [Buffer.from("bonding-curve"), mintKey.toBuffer()],
    PUMP_PROGRAM_ID,
  );
  const [curveInfo, mintInfo] = await Promise.all([
    connection.getAccountInfo(curveKey, "confirmed"),
    connection.getAccountInfo(mintKey, "confirmed"),
  ]);
  if (!curveInfo || !curveInfo.owner.equals(PUMP_PROGRAM_ID))
    throw new Error("Official Pump bonding curve is unavailable");
  if (!mintInfo || mintInfo.data.length < 82) throw new Error("Pump collateral mint is invalid");
  const curve = decodePumpCurve(curveInfo.data);
  if (curve.complete) throw new Error("Pump bonding curve has graduated");
  if (marketLltvBps > config.singleVenueMaxLltvBps)
    throw new Error("Market LLTV exceeds the Pump single-venue safety ceiling");
  if (!curve.quoteMint.equals(PublicKey.default))
    throw new Error("Only SOL-paired Pump bonding curves are currently supported");
  const decimals = mintInfo.data[44]!;
  const sizes = [10n, 50n, 100n]
    .map((bps) => (curve.realTokenReserves * bps) / 10_000n)
    .filter((amount) => amount > 0n);
  const results: Array<{ amount: bigint; output: bigint; disagreement: number }> = [];
  for (const amount of sizes) {
    const expectedSol = pumpSellQuote(curve, amount);
    const tokenQuote = await quote(mint, USDC, amount, config);
    const solQuote = await quote(WSOL, USDC, expectedSol, config);
    if (
      !tokenQuote.routePlan?.some(
        ({ swapInfo }) =>
          swapInfo?.inputMint === mint && swapInfo.label?.toLowerCase().includes("pump"),
      )
    )
      throw new Error("Jupiter route does not originate from the official Pump venue");
    const tokenOut = BigInt(tokenQuote.otherAmountThreshold);
    const curveOut = BigInt(solQuote.otherAmountThreshold);
    const disagreement = integerDeviationBps(tokenOut, curveOut);
    if (disagreement > config.maxSourceDeviationBps)
      throw new Error(`Pump reserves and executable quote disagree by ${disagreement} bps`);
    results.push({ amount, output: tokenOut < curveOut ? tokenOut : curveOut, disagreement });
  }
  const unitScale = 10n ** BigInt(decimals);
  const prices = results.map(({ amount, output }) => (output * unitScale * 1_000_000n) / amount);
  const conservativePrice = prices.reduce((left, right) => (left < right ? left : right));
  const haircutPrice =
    (conservativePrice * BigInt(10_000 - config.singleVenuePriceHaircutBps)) / 10_000n;
  const largest = results.at(-1)!;
  const recoverableAtomic =
    (largest.output * BigInt(config.singleVenueLiquidityHaircutBps)) / 10_000n;
  const capAtomic = BigInt(Math.floor(config.singleVenueMaxRecoverableUsdc * 1_000_000));
  const recoverable = recoverableAtomic < capAtomic ? recoverableAtomic : capAtomic;
  if (haircutPrice === 0n || recoverable === 0n)
    throw new Error("Pump conservative output rounded to zero");
  return {
    priceUsd: Number(haircutPrice) / 1_000_000_000_000,
    confidenceBps: Math.max(...results.map(({ disagreement }) => disagreement)),
    deviationBps: Math.max(...results.map(({ disagreement }) => disagreement)),
    liquidityUsd: Number(recoverable) / 1_000_000,
    maxRecoverableUsdc: Number(recoverable) / 1_000_000,
    sources: ["pump-bonding-curve", "jupiter-executable"],
  };
}
