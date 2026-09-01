import {
  decodePinocchioMarket,
  decodePinocchioOracleConfiguration,
  decodePinocchioOracleObservation,
  encodePinocchioOracleObservation,
  PINOCCHIO_MARKET_LEN,
  PINOCCHIO_TAG,
  pinocchioInstruction,
  pinocchioPdas,
} from "@meme-lend/sdk";
import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import type { PublisherConfig } from "./config.js";
import { aggregatePrice, type PriceResult } from "./pricing.js";

const writable = (pubkey: PublicKey, isSigner = false) => ({ pubkey, isSigner, isWritable: true });
const readonly = (pubkey: PublicKey) => ({ pubkey, isSigner: false, isWritable: false });

export type PublishOutcome = { market: string; signature: string; sources: string[] };

type MarketAccount = { pubkey: PublicKey; account: { data: Buffer } };

export function publishingPriority(input: {
  sourceIndex: number;
  hasObservation: boolean;
  pendingConfirmation: boolean;
  stale: boolean;
}): number {
  if (!input.hasObservation || input.stale) return input.sourceIndex === 0 ? 0 : 3;
  if (input.pendingConfirmation) return input.sourceIndex === 1 ? 0 : 3;
  return input.sourceIndex === 0 ? 1 : 3;
}

async function prioritizedAccounts(
  connection: Connection,
  signer: Keypair,
  config: PublisherConfig,
  accounts: readonly MarketAccount[],
): Promise<MarketAccount[]> {
  const keys = accounts.flatMap(({ pubkey }) => {
    const [oracle] = pinocchioPdas.oracleConfig(pubkey, config.programId);
    const [observation] = pinocchioPdas.oracleObservation(pubkey, config.programId);
    return [oracle, observation];
  });
  const infos = await connection.getMultipleAccountsInfo(keys, "confirmed");
  const now = Math.floor(Date.now() / 1000);
  return accounts
    .map((account, index) => {
      try {
        const oracleInfo = infos[index * 2],
          observationInfo = infos[index * 2 + 1];
        if (!oracleInfo) return { account, priority: 4 };
        const oracle = decodePinocchioOracleConfiguration(oracleInfo.data);
        const sourceIndex = oracle.sources.findIndex((source) => source.equals(signer.publicKey));
        if (sourceIndex < 0) return { account, priority: 4 };
        const prior = observationInfo
          ? decodePinocchioOracleObservation(observationInfo.data)
          : null;
        const stale =
          prior !== null &&
          (prior.publishedAt > BigInt(now) ||
            BigInt(now) - prior.publishedAt > BigInt(oracle.maxAgeSeconds));
        return {
          account,
          priority: publishingPriority({
            sourceIndex,
            hasObservation: prior !== null,
            pendingConfirmation: prior?.publisher.equals(PublicKey.default) ?? false,
            stale,
          }),
        };
      } catch {
        return { account, priority: 4 };
      }
    })
    .sort((left, right) => left.priority - right.priority)
    .map(({ account }) => account);
}

export async function publishAll(
  connection: Connection,
  signer: Keypair,
  config: PublisherConfig,
): Promise<{
  published: PublishOutcome[];
  failures: Array<{ market: string; error: string }>;
  discovered: number;
}> {
  const accounts = await connection.getProgramAccounts(config.programId, {
    commitment: "confirmed",
    filters: [{ dataSize: PINOCCHIO_MARKET_LEN }],
  });
  const ordered = await prioritizedAccounts(connection, signer, config, accounts);
  const published: PublishOutcome[] = [];
  const failures: Array<{ market: string; error: string }> = [];
  const priceCache = new Map<string, Promise<PriceResult>>();
  for (const account of ordered) {
    try {
      const outcome = await publishMarket(
        connection,
        signer,
        config,
        account.pubkey,
        account.account.data,
        priceCache,
      );
      if (outcome) published.push(outcome);
    } catch (error) {
      failures.push({
        market: account.pubkey.toBase58(),
        error: error instanceof Error ? error.message : "Unknown publishing failure",
      });
    }
  }
  return { published, failures, discovered: accounts.length };
}

export async function publishMarket(
  connection: Connection,
  signer: Keypair,
  config: PublisherConfig,
  marketKey: PublicKey,
  marketData?: Uint8Array,
  priceCache = new Map<string, Promise<PriceResult>>(),
): Promise<PublishOutcome | null> {
  const info = marketData ?? (await connection.getAccountInfo(marketKey, "confirmed"))?.data;
  if (!info) throw new Error("Market account is unavailable");
  const market = decodePinocchioMarket(info);
  const [oracleConfigKey] = pinocchioPdas.oracleConfig(marketKey, config.programId);
  const [observationKey, bump] = pinocchioPdas.oracleObservation(marketKey, config.programId);
  const [oracleInfo, observationInfo] = await Promise.all([
    connection.getAccountInfo(oracleConfigKey, "confirmed"),
    connection.getAccountInfo(observationKey, "confirmed"),
  ]);
  if (!oracleInfo) throw new Error("Oracle configuration is unavailable");
  const oracle = decodePinocchioOracleConfiguration(oracleInfo.data);
  if (!oracle.sources.some((source) => source.equals(signer.publicKey)))
    throw new Error("This signer is not an immutable publisher for the market");
  let prior = observationInfo ? decodePinocchioOracleObservation(observationInfo.data) : null;
  const now = Math.floor(Date.now() / 1000);
  // The program requires the two immutable publishers to alternate. A report
  // is usable only after the other publisher has cross-checked the preceding
  // fresh report, so neither key can unilaterally keep an oracle live.
  const priorStale =
    prior !== null &&
    (prior.publishedAt > BigInt(now) ||
      BigInt(now) - prior.publishedAt > BigInt(oracle.maxAgeSeconds));
  const priorAge = prior ? Math.max(0, now - Number(prior.publishedAt)) : null;
  if (
    prior &&
    !prior.publisher.equals(PublicKey.default) &&
    !priorStale &&
    !shouldStartOracleRefresh(priorAge!, oracle.maxAgeSeconds, config.refreshLeadSeconds)
  )
    return null;
  const expectedPublisher =
    prior?.publisher.equals(PublicKey.default) && !priorStale
      ? oracle.sources[1]
      : oracle.sources[0];
  if (!expectedPublisher?.equals(signer.publicKey)) return null;
  const cacheKey = `${market.collateralMint.toBase58()}:${market.lltvBps}`;
  let pricePromise = priceCache.get(cacheKey);
  if (!pricePromise) {
    pricePromise = aggregatePrice(
      connection,
      market.collateralMint.toBase58(),
      config,
      market.lltvBps,
    );
    priceCache.set(cacheKey, pricePromise);
  }
  const result = await pricePromise;
  if (result.confidenceBps > oracle.maxConfidenceBps)
    throw new Error(
      `Confidence ${result.confidenceBps} exceeds market limit ${oracle.maxConfidenceBps}`,
    );
  const price = usdPriceToOracle(result.priceUsd, 6 + oracle.priceDecimals);
  const recoverableUsd = Math.min(
    config.maxRecoverableUsdc,
    result.maxRecoverableUsdc ?? (result.liquidityUsd * config.liquidityHaircutBps) / 10_000,
  );
  const maxRecoverableUsdc = BigInt(Math.floor(recoverableUsd * 1_000_000));
  if (price <= 0n || maxRecoverableUsdc <= 0n)
    throw new Error("Conservative oracle output rounded to zero");
  const observationDeviationBps = result.deviationBps;
  if (observationDeviationBps > oracle.maxDeviationBps)
    throw new Error(
      `Price movement ${observationDeviationBps} bps exceeds market limit ${oracle.maxDeviationBps}`,
    );
  // Pricing can take several seconds. Re-read the round before signing so a
  // concurrent publisher cannot make this transaction use an obsolete
  // sequence or publisher turn.
  const latestObservationInfo = await connection.getAccountInfo(observationKey, "confirmed");
  prior = latestObservationInfo
    ? decodePinocchioOracleObservation(latestObservationInfo.data)
    : null;
  const submitNow = Math.floor(Date.now() / 1000);
  const latestStale =
    prior !== null &&
    (prior.publishedAt > BigInt(submitNow) ||
      BigInt(submitNow) - prior.publishedAt > BigInt(oracle.maxAgeSeconds));
  const latestExpectedPublisher =
    prior?.publisher.equals(PublicKey.default) && !latestStale
      ? oracle.sources[1]
      : oracle.sources[0];
  if (!latestExpectedPublisher?.equals(signer.publicKey)) return null;

  const payload = encodePinocchioOracleObservation({
    price,
    confidenceBps: result.confidenceBps,
    deviationBps: observationDeviationBps,
    maxRecoverableUsdc,
    publishedAt: BigInt(submitNow),
    sequence: (prior?.sequence ?? 0n) + 1n,
    bump,
  });
  const transaction = new Transaction().add(
    pinocchioInstruction(
      PINOCCHIO_TAG.submitOracleObservation,
      [
        writable(signer.publicKey, true),
        readonly(marketKey),
        readonly(oracleConfigKey),
        writable(observationKey),
        readonly(SystemProgram.programId),
      ],
      payload,
      config.programId,
    ),
  );
  const signature = await sendAndConfirmTransaction(connection, transaction, [signer], {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  return { market: marketKey.toBase58(), signature, sources: result.sources };
}

export function shouldStartOracleRefresh(
  observationAgeSeconds: number,
  maxAgeSeconds: number,
  refreshLeadSeconds: number,
): boolean {
  return observationAgeSeconds >= Math.max(0, maxAgeSeconds - refreshLeadSeconds);
}

export function usdPriceToOracle(priceUsd: number, decimals: number): bigint {
  if (!Number.isFinite(priceUsd) || priceUsd <= 0 || !Number.isInteger(decimals) || decimals < 0)
    throw new Error("Invalid oracle price conversion");
  const [whole, fraction = ""] = priceUsd.toFixed(decimals).split(".");
  return BigInt(whole!) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0"));
}
