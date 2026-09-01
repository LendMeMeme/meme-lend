import { PublicKey, SystemProgram, TransactionInstruction, type Connection } from "@solana/web3.js";

export const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
);

export function validateSupportedMintData(
  data: Uint8Array,
  tokenProgram: PublicKey,
  label = "Token",
): number {
  if (data.length < 82 || data[45] !== 1) {
    throw new Error(`${label} address is not an initialized token mint`);
  }
  if (tokenProgram.equals(TOKEN_2022_PROGRAM_ID) && data.length > 82) {
    throw new Error(`${label} uses Token-2022 extensions that this protocol does not support`);
  }
  return data[44];
}

export function associatedTokenAddress(
  mint: PublicKey,
  owner: PublicKey,
  tokenProgram = TOKEN_PROGRAM_ID,
): PublicKey {
  return associatedTokenAddressWithBump(mint, owner, tokenProgram)[0];
}

export function associatedTokenAddressWithBump(
  mint: PublicKey,
  owner: PublicKey,
  tokenProgram = TOKEN_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), tokenProgram.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
}

export function createAssociatedTokenAccountIdempotentInstruction(
  payer: PublicKey,
  associatedToken: PublicKey,
  owner: PublicKey,
  mint: PublicKey,
  tokenProgram = TOKEN_PROGRAM_ID,
): TransactionInstruction {
  return new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: associatedToken, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: tokenProgram, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([1]),
  });
}

export async function getMintDecimals(
  connection: Connection,
  mint: PublicKey,
  tokenProgram?: PublicKey,
): Promise<number> {
  const account = await connection.getAccountInfo(mint, "confirmed");
  if (!account) throw new Error(`Mint account does not exist: ${mint.toBase58()}`);
  if (tokenProgram && !account.owner.equals(tokenProgram))
    throw new Error(`Unexpected token program for mint: ${mint.toBase58()}`);
  return validateSupportedMintData(account.data, account.owner, `Mint ${mint.toBase58()}`);
}
