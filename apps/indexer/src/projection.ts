import type { MemeLendDatabase } from "@meme-lend/database";
import {
  decodePinocchioMarket,
  decodePinocchioOracleConfiguration,
  decodePinocchioOracleObservation,
  decodePinocchioReserve,
  pinocchioPdas,
} from "@meme-lend/sdk";
import type { MarketView } from "@meme-lend/shared";
import { Connection, PublicKey } from "@solana/web3.js";
import { classifyMarket } from "./classification.js";

const TOKEN = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const TOKEN_2022 = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
const ASSOCIATED = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

export async function refreshMarket(
  connection: Connection,
  database: MemeLendDatabase,
  marketAddress: string,
  slot: number,
): Promise<void> {
  const address = new PublicKey(marketAddress);
  const marketInfo = await connection.getAccountInfo(address, "finalized");
  if (!marketInfo) throw new Error(`Missing market account ${marketAddress}`);
  const market = decodePinocchioMarket(marketInfo.data);
  const [authority] = pinocchioPdas.marketAuthority(address, marketInfo.owner);
  const loanProgram = market.loanToken2022 ? TOKEN_2022 : TOKEN;
  const [liquidityVault] = PublicKey.findProgramAddressSync(
    [authority.toBuffer(), loanProgram.toBuffer(), market.loanMint.toBuffer()],
    ASSOCIATED,
  );
  const [oracleAddress] = pinocchioPdas.oracleConfig(address, marketInfo.owner);
  const [observationAddress] = pinocchioPdas.oracleObservation(address, marketInfo.owner);
  const [reserveAddress] = pinocchioPdas.reserve(address, marketInfo.owner);
  const [oracleInfo, observationInfo, reserveInfo, balance] = await Promise.all([
    connection.getAccountInfo(oracleAddress, "finalized"),
    connection.getAccountInfo(observationAddress, "finalized"),
    connection.getAccountInfo(reserveAddress, "finalized"),
    connection.getTokenAccountBalance(liquidityVault, "finalized"),
  ]);
  if (!oracleInfo || !reserveInfo) throw new Error(`Incomplete market ${marketAddress}`);
  const oracle = decodePinocchioOracleConfiguration(oracleInfo.data);
  const observation = observationInfo
    ? decodePinocchioOracleObservation(observationInfo.data)
    : null;
  const reserve = decodePinocchioReserve(reserveInfo.data);
  const cash = BigInt(balance.value.amount),
    debt = market.totalDebt;
  const supplied = cash + debt - market.creatorFeesClaimable - market.protocolFeesClaimable;
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
  const now = BigInt(Math.floor(Date.now() / 1000));
  const fresh =
    observation !== null &&
    observation.publishedAt <= now &&
    now - observation.publishedAt <= BigInt(oracle.maxAgeSeconds);
  const ageDays = firstEvent?.blockTime
    ? Math.floor((Date.now() - new Date(firstEvent.blockTime).getTime()) / 86_400_000)
    : 0;
  const classification = classifyMarket({
    customOracle: oracle.kind === 4,
    oracleFresh: fresh,
    ageDays,
    uniqueLenders,
    suppliedUsdc: Number(supplied) / 1_000_000,
    collateralLiquidityUsd: null,
    badDebtUsdc: Number(market.badDebt) / 1_000_000,
    manualCurated: false,
    restrictedReason: null,
  });
  const view: MarketView = {
    address: marketAddress,
    collateralMint: market.collateralMint.toBase58(),
    collateralName: null,
    collateralSymbol: null,
    loanMint: market.loanMint.toBase58(),
    creator: market.creator.toBase58(),
    status: classification.status,
    statusReasons: classification.reasons,
    oracleKind: "Custom",
    customOracleHighRisk: oracle.customHighRisk,
    lltvBps: market.lltvBps,
    supplyApyBps: null,
    borrowApyBps: null,
    suppliedUsdc: supplied.toString(),
    borrowedUsdc: debt.toString(),
    availableUsdc: cash.toString(),
    utilizationBps,
    firstLossReserve: reserve.deposited.toString(),
    badDebt: market.badDebt.toString(),
    oraclePublishedAt: observation
      ? new Date(Number(observation.publishedAt) * 1000).toISOString()
      : null,
    collateralLiquidityUsd: null,
    estimatedSellSlippageBps: null,
    slot,
    updatedAt: new Date().toISOString(),
  };
  await database.upsertMarket(view);
  if (observation)
    await database.upsertObservation({
      id: `${marketAddress}:${observation.sequence}`,
      market: marketAddress,
      publisher: observation.publisher.toBase58(),
      price: observation.price.toString(),
      confidenceBps: observation.confidenceBps,
      deviationBps: observation.deviationBps,
      maxRecoverableUsdc: observation.maxRecoverableUsdc.toString(),
      publishedAt: new Date(Number(observation.publishedAt) * 1000).toISOString(),
      slot,
    });
}
