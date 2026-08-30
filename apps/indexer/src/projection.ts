import { BorshAccountsCoder, BN } from "@coral-xyz/anchor";
import type { MemeLendDatabase } from "@meme-lend/database";
import { MEME_LEND_IDL } from "@meme-lend/sdk";
import type { MarketView, OracleKind } from "@meme-lend/shared";
import { Connection, PublicKey } from "@solana/web3.js";
import { classifyMarket } from "./classification.js";

const coder = new BorshAccountsCoder(MEME_LEND_IDL);
const integer = (value: BN | number) => BigInt(value instanceof BN ? value.toString() : value);
const oracleName = (value: Record<string, unknown>): OracleKind => {
  const name = Object.keys(value)[0] ?? "custom";
  const names: Record<string, OracleKind> = {
    pyth: "Pyth",
    switchboard: "Switchboard",
    dexTwap: "DexTwap",
    aggregatedPools: "AggregatedPools",
    custom: "Custom",
  };
  return names[name] ?? "Custom";
};
async function decoded(connection: Connection, address: PublicKey, name: string) {
  const info = await connection.getAccountInfo(address, "finalized");
  if (!info) throw new Error(`Missing ${name} account ${address.toBase58()}`);
  return coder.decode(name, info.data) as Record<string, unknown>;
}

export async function refreshMarket(
  connection: Connection,
  database: MemeLendDatabase,
  marketAddress: string,
  slot: number,
): Promise<void> {
  const address = new PublicKey(marketAddress);
  const market = await decoded(connection, address, "market");
  const oracleConfig = await decoded(
    connection,
    market.oracleConfiguration as PublicKey,
    "oracleConfiguration",
  );
  const programId = new PublicKey(MEME_LEND_IDL.address);
  const [observationAddress] = PublicKey.findProgramAddressSync(
    [Buffer.from("observation"), address.toBuffer()],
    programId,
  );
  const [reserveAddress] = PublicKey.findProgramAddressSync(
    [Buffer.from("reserve"), address.toBuffer()],
    programId,
  );
  const observation = await decoded(connection, observationAddress, "oracleObservation").catch(
    () => null,
  );
  const reserve = await decoded(connection, reserveAddress, "firstLossReserve");
  const cash = BigInt(
    (await connection.getTokenAccountBalance(market.liquidityVault as PublicKey, "finalized")).value
      .amount,
  );
  const debt = integer(market.totalDebt as BN);
  const supplied =
    cash +
    debt -
    integer(market.creatorFeesClaimable as BN) -
    integer(market.protocolFeesClaimable as BN);
  const utilizationBps = cash + debt === 0n ? 0 : Number((debt * 10_000n) / (cash + debt));
  const firstEvent = await database
    .transactions()
    .find({ market: marketAddress, event: "MarketCreated" })
    .sort({ slot: 1 })
    .limit(1)
    .next();
  const uniqueLenders = (
    await database.transactions().distinct("actor", {
      market: marketAddress,
      event: "LiquiditySupplied",
      actor: { $ne: null },
    })
  ).length;
  const publishedAt = observation ? Number(integer(observation.publishedAt as BN)) : null;
  const now = Math.floor(Date.now() / 1000);
  const fresh =
    publishedAt !== null &&
    publishedAt <= now &&
    now - publishedAt <= Number(oracleConfig.maxAgeSeconds);
  const kind = oracleName(oracleConfig.kind as Record<string, unknown>);
  const ageDays = firstEvent?.blockTime
    ? Math.floor((Date.now() - new Date(firstEvent.blockTime).getTime()) / 86_400_000)
    : 0;
  const badDebt = integer(market.badDebt as BN);
  const classification = classifyMarket({
    customOracle: kind === "Custom",
    oracleFresh: fresh,
    ageDays,
    uniqueLenders,
    suppliedUsdc: Number(supplied) / 1_000_000,
    collateralLiquidityUsd: null,
    badDebtUsdc: Number(badDebt) / 1_000_000,
    manualCurated: false,
    restrictedReason: null,
  });
  const view: MarketView = {
    address: marketAddress,
    collateralMint: (market.collateralMint as PublicKey).toBase58(),
    collateralName: null,
    collateralSymbol: null,
    loanMint: (market.loanMint as PublicKey).toBase58(),
    creator: (market.creator as PublicKey).toBase58(),
    status: classification.status,
    statusReasons: classification.reasons,
    oracleKind: kind,
    customOracleHighRisk: kind === "Custom",
    lltvBps: Number(market.lltvBps),
    supplyApyBps: null,
    borrowApyBps: null,
    suppliedUsdc: supplied.toString(),
    borrowedUsdc: debt.toString(),
    availableUsdc: cash.toString(),
    utilizationBps,
    firstLossReserve: integer(reserve.deposited as BN).toString(),
    badDebt: badDebt.toString(),
    oraclePublishedAt: publishedAt === null ? null : new Date(publishedAt * 1000).toISOString(),
    collateralLiquidityUsd: null,
    estimatedSellSlippageBps: null,
    slot,
    updatedAt: new Date().toISOString(),
  };
  await database.upsertMarket(view);
  if (observation)
    await database.upsertObservation({
      id: `${marketAddress}:${integer(observation.sequence as BN)}`,
      market: marketAddress,
      publisher: (observation.publisher as PublicKey).toBase58(),
      price: integer(observation.price as BN).toString(),
      confidenceBps: Number(observation.confidenceBps),
      deviationBps: Number(observation.deviationBps),
      maxRecoverableUsdc: integer(observation.maxRecoverableUsdc as BN).toString(),
      publishedAt: new Date(Number(integer(observation.publishedAt as BN)) * 1000).toISOString(),
      slot,
    });
}
