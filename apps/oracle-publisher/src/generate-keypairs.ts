import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { Keypair } from "@solana/web3.js";

const directory = resolve(process.env.ORACLE_KEYPAIR_DIR ?? homedir(), ".config", "solana");
mkdirSync(directory, { recursive: true });
for (const role of ["primary", "backup"] as const) {
  const keypair = Keypair.generate();
  const path = resolve(directory, `lend-meme-loans-oracle-${role}.json`);
  writeFileSync(path, JSON.stringify([...keypair.secretKey]), { encoding: "utf8", mode: 0o600 });
  console.log(`${role} ${keypair.publicKey.toBase58()} ${path}`);
}
