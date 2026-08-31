import "dotenv/config";
import {
  decodePinocchioBorrowerPosition,
  decodePinocchioMarket,
  decodePinocchioOracleConfiguration,
  decodePinocchioOracleObservation,
  associatedTokenAddress,
  getMintDecimals,
  PINOCCHIO_TAG,
  pinocchioAmount,
  pinocchioInstruction,
  pinocchioPdas,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@meme-lend/sdk";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  type AccountMeta,
} from "@solana/web3.js";
import { readFile } from "node:fs/promises";
import { evaluateHealth, observationIsFresh } from "./health.js";

const connection = new Connection(
  process.env.SOLANA_RPC_HTTP ?? "http://127.0.0.1:8899",
  "confirmed",
);
const programId = new PublicKey(
  process.env.PROGRAM_ID ?? "FvnWFJpAfdps7tTYzcg2ByKHufRxN7RyiLni1oB3jFaX",
);
const interval = Number(process.env.POLL_INTERVAL_MS ?? "5000");
const maxRepay = BigInt(process.env.MAX_REPAY_USDC_UNITS ?? "18446744073709551615");
const signer = process.env.LIQUIDATOR_KEYPAIR_PATH
  ? Keypair.fromSecretKey(
      Uint8Array.from(
        JSON.parse(await readFile(process.env.LIQUIDATOR_KEYPAIR_PATH, "utf8")) as number[],
      ),
    )
  : Keypair.generate();
const executionEnabled = Boolean(process.env.LIQUIDATOR_KEYPAIR_PATH);
const m = (pubkey: PublicKey, isWritable = false, isSigner = false): AccountMeta => ({
  pubkey,
  isWritable,
  isSigner,
});
if (!executionEnabled)
  console.warn("Liquidator is dry-run only: LIQUIDATOR_KEYPAIR_PATH is not configured.");

for (;;) {
  try {
    const records = await connection.getProgramAccounts(programId, {
      commitment: "confirmed",
      filters: [{ dataSize: 91 }, { memcmp: { offset: 1, bytes: "7" } }],
    });
    let unhealthy = 0;
    for (const record of records) {
      const position = decodePinocchioBorrowerPosition(record.account.data);
      if (position.borrowShares === 0n) continue;
      const marketInfo = await connection.getAccountInfo(position.market, "confirmed");
      if (!marketInfo) continue;
      const market = decodePinocchioMarket(marketInfo.data);
      const [oracleConfigKey] = pinocchioPdas.oracleConfig(position.market, programId);
      const [observationKey] = pinocchioPdas.oracleObservation(position.market, programId);
      const [oracleInfo, observationInfo] = await Promise.all([
        connection.getAccountInfo(oracleConfigKey, "confirmed"),
        connection.getAccountInfo(observationKey, "confirmed"),
      ]);
      if (!oracleInfo || !observationInfo) continue;
      const oracle = decodePinocchioOracleConfiguration(oracleInfo.data);
      const observation = decodePinocchioOracleObservation(observationInfo.data);
      if (
        !observationIsFresh(
          BigInt(Math.floor(Date.now() / 1000)),
          observation.publishedAt,
          oracle.maxAgeSeconds,
        )
      )
        continue;
      const collateralProgram = market.collateralToken2022
        ? TOKEN_2022_PROGRAM_ID
        : TOKEN_PROGRAM_ID;
      const loanProgram = market.loanToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
      const decimals = await getMintDecimals(connection, market.collateralMint, collateralProgram);
      const health = evaluateHealth({
        borrowShares: position.borrowShares,
        borrowIndex: market.borrowIndex,
        collateralAmount: position.collateralAmount,
        collateralDecimals: decimals,
        price: observation.price,
        priceDecimals: oracle.priceDecimals,
        lltvBps: market.lltvBps,
        closeFactorBps: market.closeFactorBps,
        maxRepay,
      });
      if (!health.unhealthy) continue;
      unhealthy += 1;
      console.info(
        JSON.stringify({
          market: position.market.toBase58(),
          borrower: position.owner.toBase58(),
          debt: health.debt.toString(),
          collateralValue: health.collateralValue.toString(),
          requestedRepay: health.requestedRepay.toString(),
          executionEnabled,
        }),
      );
      if (!executionEnabled || health.requestedRepay === 0n) continue;
      const [authority] = pinocchioPdas.marketAuthority(position.market, programId);
      const [reserve] = pinocchioPdas.reserve(position.market, programId);
      const [reserveVault] = pinocchioPdas.reserveVault(position.market, programId);
      const liquidity = associatedTokenAddress(market.loanMint, authority, loanProgram);
      const collateralVault = associatedTokenAddress(
        market.collateralMint,
        authority,
        collateralProgram,
      );
      const liquidatorLoan = associatedTokenAddress(market.loanMint, signer.publicKey, loanProgram);
      const liquidatorCollateral = associatedTokenAddress(
        market.collateralMint,
        signer.publicKey,
        collateralProgram,
      );
      const instruction = pinocchioInstruction(
        PINOCCHIO_TAG.liquidate,
        [
          m(signer.publicKey, false, true),
          m(position.market, true),
          m(record.pubkey, true),
          m(liquidatorLoan, true),
          m(liquidatorCollateral, true),
          m(liquidity, true),
          m(collateralVault, true),
          m(reserve, true),
          m(reserveVault, true),
          m(market.loanMint),
          m(market.collateralMint),
          m(authority),
          m(loanProgram),
          m(collateralProgram),
          m(oracleConfigKey),
          m(observationKey),
        ],
        pinocchioAmount(health.requestedRepay),
        programId,
      );
      const signature = await sendAndConfirmTransaction(
        connection,
        new Transaction().add(instruction),
        [signer],
        { commitment: "confirmed" },
      );
      console.info(
        JSON.stringify({
          event: "liquidation-submitted",
          signature,
          market: position.market.toBase58(),
          borrower: position.owner.toBase58(),
        }),
      );
    }
    console.info(
      JSON.stringify({
        checkedAt: new Date().toISOString(),
        borrowerPositionsScanned: records.length,
        unhealthy,
      }),
    );
  } catch (error) {
    console.error("Liquidator scan failed", error);
  }
  await new Promise((resolve) => setTimeout(resolve, interval));
}
