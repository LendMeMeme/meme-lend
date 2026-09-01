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
import { aggregatePrice } from "./pricing.js";

const writable = (pubkey: PublicKey, isSigner = false) => ({ pubkey, isSigner, isWritable: true });
const readonly = (pubkey: PublicKey) => ({ pubkey, isSigner: false, isWritable: false });

export type PublishOutcome = { market: string; signature: string; sources: string[] };

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
  const published: PublishOutcome[] = [];
  const failures: Array<{ market: string; error: string }> = [];
  for (const account of accounts) {
    try {
      const outcome = await publishMarket(
        connection,
        signer,
        config,
        account.pubkey,
        account.account.data,
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
  const prior = observationInfo ? decodePinocchioOracleObservation(observationInfo.data) : null;
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
  const result = await aggregatePrice(
    connection,
    market.collateralMint.toBase58(),
    config,
    market.lltvBps,
  );
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
  const payload = encodePinocchioOracleObservation({
    price,
    confidenceBps: result.confidenceBps,
    deviationBps: observationDeviationBps,
    maxRecoverableUsdc,
    publishedAt: BigInt(now),
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
