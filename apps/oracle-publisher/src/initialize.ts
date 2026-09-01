import "dotenv/config";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import {
  decodePinocchioGlobalConfig,
  PINOCCHIO_PROGRAM_ID,
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

const USDC = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const rpc = process.env.SOLANA_RPC_HTTP ?? "https://api.mainnet-beta.solana.com";
const keypairPath =
  process.env.INITIALIZE_KEYPAIR_PATH ??
  resolve(homedir(), ".config", "solana", "lend-meme-loans-mainnet-v2-deployer.json");
const signer = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(readFileSync(keypairPath, "utf8"))),
);
const feeRecipient = new PublicKey(process.env.PROTOCOL_FEE_RECIPIENT ?? signer.publicKey);
const maxOracleAgeSeconds = Number(process.env.MAX_ORACLE_AGE_SECONDS ?? "120");
if (process.env.CONFIRM_MAINNET_INITIALIZATION !== "YES")
  throw new Error(
    "Set CONFIRM_MAINNET_INITIALIZATION=YES to authorize the irreversible initialization",
  );
if (!Number.isInteger(maxOracleAgeSeconds) || maxOracleAgeSeconds < 30 || maxOracleAgeSeconds > 600)
  throw new Error("MAX_ORACLE_AGE_SECONDS must be between 30 and 600");

const connection = new Connection(rpc, "confirmed");
const [global, bump] = pinocchioPdas.globalConfig(PINOCCHIO_PROGRAM_ID);
const existing = await connection.getAccountInfo(global, "confirmed");
if (existing) {
  const config = decodePinocchioGlobalConfig(existing.data);
  if (!config.approvedLoanMint.equals(USDC) || !config.protocolFeeRecipient.equals(feeRecipient))
    throw new Error("Protocol is already initialized with different immutable values");
  console.log(JSON.stringify({ status: "already-initialized", global: global.toBase58(), config }));
  process.exit(0);
}
const mint = await connection.getAccountInfo(USDC, "confirmed");
if (!mint) throw new Error("Mainnet USDC mint is unavailable");
const u32 = Buffer.alloc(4);
u32.writeUInt32LE(maxOracleAgeSeconds);
const instruction = pinocchioInstruction(
  PINOCCHIO_TAG.initializeProtocol,
  [
    { pubkey: signer.publicKey, isSigner: true, isWritable: true },
    { pubkey: global, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ],
  Buffer.concat([USDC.toBuffer(), feeRecipient.toBuffer(), u32, Buffer.from([bump])]),
  PINOCCHIO_PROGRAM_ID,
);
const transaction = new Transaction().add(instruction);
transaction.feePayer = signer.publicKey;
transaction.recentBlockhash = (await connection.getLatestBlockhash("confirmed")).blockhash;
transaction.sign(signer);
const simulation = await connection.simulateTransaction(transaction);
if (simulation.value.err)
  throw new Error(`Initialization simulation failed: ${JSON.stringify(simulation.value.err)}`);
const signature = await sendAndConfirmTransaction(connection, transaction, [signer], {
  commitment: "confirmed",
  preflightCommitment: "confirmed",
});
const created = await connection.getAccountInfo(global, "confirmed");
if (!created) throw new Error("Initialization confirmed but global config is unavailable");
const config = decodePinocchioGlobalConfig(created.data);
console.log(
  JSON.stringify({
    status: "initialized",
    signature,
    global: global.toBase58(),
    authority: config.authority.toBase58(),
    approvedLoanMint: config.approvedLoanMint.toBase58(),
    protocolFeeRecipient: config.protocolFeeRecipient.toBase58(),
    maxOracleAgeSeconds: config.maxOracleAgeSeconds,
  }),
);
