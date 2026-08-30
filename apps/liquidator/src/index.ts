import "dotenv/config";
import anchor from "@coral-xyz/anchor";
import type { BN as BNType } from "@coral-xyz/anchor";
import { createMemeLendProgram, marketAuthorityPda } from "@meme-lend/sdk";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getMint,
} from "@solana/spl-token";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { readFile } from "node:fs/promises";
import { evaluateHealth, observationIsFresh } from "./health.js";

const { AnchorProvider, BN, Wallet } = anchor;

const connection = new Connection(
  process.env.SOLANA_RPC_HTTP ?? "http://127.0.0.1:8899",
  "confirmed",
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
const program = createMemeLendProgram(
  new AnchorProvider(connection, new Wallet(signer), { commitment: "confirmed" }),
);
if (!executionEnabled)
  console.warn("Liquidator is dry-run only: LIQUIDATOR_KEYPAIR_PATH is not configured.");

for (;;) {
  try {
    const positions = await program.account.borrowerPosition.all();
    let unhealthy = 0;
    for (const record of positions) {
      const position = record.account as unknown as {
        market: PublicKey;
        owner: PublicKey;
        collateralAmount: BNType;
        borrowShares: BNType;
      };
      if (position.borrowShares.isZero()) continue;
      const marketKey = position.market;
      const market = (await program.account.market.fetch(marketKey)) as unknown as Record<
        string,
        PublicKey | BNType | number
      >;
      const oracleConfiguration = new PublicKey(market.oracleConfiguration as PublicKey);
      const oracle = (await program.account.oracleConfiguration.fetch(
        oracleConfiguration,
      )) as unknown as { maxAgeSeconds: number };
      const [oracleObservation] = PublicKey.findProgramAddressSync(
        [Buffer.from("observation"), marketKey.toBuffer()],
        program.programId,
      );
      const observation = (await program.account.oracleObservation.fetch(
        oracleObservation,
      )) as unknown as { price: BNType; publishedAt: BNType };
      if (
        !observationIsFresh(
          BigInt(Math.floor(Date.now() / 1000)),
          BigInt(observation.publishedAt.toString()),
          oracle.maxAgeSeconds,
        )
      )
        continue;
      const collateralMint = new PublicKey(market.collateralMint as PublicKey);
      const loanMint = new PublicKey(market.loanMint as PublicKey);
      const collateralTokenProgram = new PublicKey(market.collateralTokenProgram as PublicKey);
      const loanTokenProgram = new PublicKey(market.loanTokenProgram as PublicKey);
      const decimals = (
        await getMint(connection, collateralMint, "confirmed", collateralTokenProgram)
      ).decimals;
      const health = evaluateHealth({
        borrowShares: BigInt(position.borrowShares.toString()),
        borrowIndex: BigInt((market.borrowIndex as BNType).toString()),
        collateralAmount: BigInt(position.collateralAmount.toString()),
        collateralDecimals: decimals,
        price: BigInt(observation.price.toString()),
        lltvBps: market.lltvBps as number,
        closeFactorBps: market.closeFactorBps as number,
        maxRepay,
      });
      if (!health.unhealthy) continue;
      unhealthy++;
      const { debt, collateralValue, requestedRepay: requested } = health;
      console.info(
        JSON.stringify({
          market: marketKey.toBase58(),
          borrower: position.owner.toBase58(),
          debt: debt.toString(),
          collateralValue: collateralValue.toString(),
          requestedRepay: requested.toString(),
          executionEnabled,
        }),
      );
      if (!executionEnabled || requested === 0n) continue;
      const [marketAuthority] = marketAuthorityPda(program.programId, marketKey);
      const [firstLossReserve] = PublicKey.findProgramAddressSync(
        [Buffer.from("reserve"), marketKey.toBuffer()],
        program.programId,
      );
      const reserve = (await program.account.firstLossReserve.fetch(
        firstLossReserve,
      )) as unknown as { vault: PublicKey };
      const liquidatorUsdc = getAssociatedTokenAddressSync(
        loanMint,
        signer.publicKey,
        false,
        loanTokenProgram,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      );
      const liquidatorCollateral = getAssociatedTokenAddressSync(
        collateralMint,
        signer.publicKey,
        false,
        collateralTokenProgram,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      );
      const signature = await program.methods
        .liquidate(new BN(requested.toString()))
        .accountsPartial({
          liquidator: signer.publicKey,
          market: marketKey,
          borrowerPosition: record.publicKey,
          oracleConfiguration,
          oracleObservation,
          firstLossReserve,
          loanMint,
          collateralMint,
          liquidatorUsdc,
          liquidatorCollateral,
          liquidityVault: market.liquidityVault as PublicKey,
          collateralVault: market.collateralVault as PublicKey,
          reserveVault: reserve.vault,
          marketAuthority,
          loanTokenProgram,
          collateralTokenProgram,
        })
        .rpc();
      console.info(
        JSON.stringify({
          event: "liquidation-submitted",
          signature,
          market: marketKey.toBase58(),
          borrower: position.owner.toBase58(),
        }),
      );
    }
    console.info(
      JSON.stringify({
        checkedAt: new Date().toISOString(),
        borrowerPositionsScanned: positions.length,
        unhealthy,
      }),
    );
  } catch (error) {
    console.error("Liquidator scan failed", error);
  }
  await new Promise((resolve) => setTimeout(resolve, interval));
}
