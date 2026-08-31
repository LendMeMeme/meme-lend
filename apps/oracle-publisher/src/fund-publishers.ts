import "dotenv/config";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";

if (process.env.CONFIRM_MAINNET_ORACLE_FUNDING !== "YES")
  throw new Error("Set CONFIRM_MAINNET_ORACLE_FUNDING=YES to authorize publisher funding");
const path =
  process.env.INITIALIZE_KEYPAIR_PATH ??
  resolve(homedir(), ".config", "solana", "lend-protocol-mainnet-deployer.json");
const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8"))));
const connection = new Connection(
  process.env.SOLANA_RPC_HTTP ?? "https://api.mainnet-beta.solana.com",
  "confirmed",
);
const recipients = [
  [new PublicKey("6DJEenuAhzDojLcGgDhs8MjtxbP9xnUpAdUG5qVmZBa1"), 0.3],
  [new PublicKey("GsoCUeJyngZMnt4Mm9Uptgavp9Poq1EskoKUou8ackGV"), 0.1],
] as const;
const transaction = new Transaction();
for (const [recipient, sol] of recipients) {
  const current = await connection.getBalance(recipient, "confirmed");
  const target = Math.floor(sol * LAMPORTS_PER_SOL);
  if (current < target)
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: recipient,
        lamports: target - current,
      }),
    );
}
if (transaction.instructions.length === 0) {
  console.log(JSON.stringify({ status: "already-funded" }));
  process.exit(0);
}
transaction.feePayer = payer.publicKey;
transaction.recentBlockhash = (await connection.getLatestBlockhash("confirmed")).blockhash;
transaction.sign(payer);
const simulation = await connection.simulateTransaction(transaction);
if (simulation.value.err)
  throw new Error(`Funding simulation failed: ${JSON.stringify(simulation.value.err)}`);
const signature = await sendAndConfirmTransaction(connection, transaction, [payer], {
  commitment: "confirmed",
  preflightCommitment: "confirmed",
});
console.log(JSON.stringify({ status: "funded", signature }));
