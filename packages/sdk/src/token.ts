import { PublicKey, SystemProgram, TransactionInstruction, type Connection } from "@solana/web3.js";

export const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
);

// Metadata and token-group records do not alter balances, transfer semantics,
// or the protocol's ability to liquidate collateral. Every behavioral
// extension remains fail-closed.
const SAFE_TOKEN_2022_MINT_EXTENSIONS = new Set([18, 19, 20, 21, 22, 23]);

function validateToken2022Extensions(data: Uint8Array, label: string): void {
  // Token-2022 pads the 82-byte mint base through byte 164, stores the account
  // type at byte 165, and begins TLV extension records at byte 166.
  if (data.length <= 82) return;
  if (data.length < 166 || data[165] !== 1)
    throw new Error(`${label} has malformed Token-2022 mint data`);

  let offset = 166;
  while (offset < data.length) {
    if (data.length - offset < 4) {
      if (data.slice(offset).every((byte) => byte === 0)) return;
      throw new Error(`${label} has malformed Token-2022 extension data`);
    }
    const extensionType = data[offset] | (data[offset + 1] << 8);
    const extensionLength = data[offset + 2] | (data[offset + 3] << 8);
    if (extensionType === 0 && extensionLength === 0) return;
    const next = offset + 4 + extensionLength;
    if (next > data.length) throw new Error(`${label} has malformed Token-2022 extension data`);
    if (!SAFE_TOKEN_2022_MINT_EXTENSIONS.has(extensionType))
      throw new Error(
        `${label} uses unsupported Token-2022 extension type ${extensionType}. Metadata and token-group extensions are supported.`,
      );
    offset = next;
  }
}

export function validateSupportedMintData(
  data: Uint8Array,
  tokenProgram: PublicKey,
  label = "Token",
): number {
  if (data.length < 82 || data[45] !== 1) {
    throw new Error(`${label} address is not an initialized token mint`);
  }
  if (tokenProgram.equals(TOKEN_2022_PROGRAM_ID)) validateToken2022Extensions(data, label);
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
