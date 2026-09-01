import { Connection, PublicKey } from "@solana/web3.js";

const METADATA_PROGRAM = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
const TOKEN_2022_PROGRAM = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
const TOKEN_2022_TLV_OFFSET = 166;
const TOKEN_METADATA_EXTENSION = 19;

function borshString(data: Uint8Array, offset: number): [string, number] {
  if (offset + 4 > data.length) throw new Error("Invalid metadata string length");
  const length = new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(
    offset,
    true,
  );
  const start = offset + 4,
    end = start + length;
  if (end > data.length || length > 256) throw new Error("Invalid metadata string");
  return [new TextDecoder().decode(data.slice(start, end)).replace(/\0/g, "").trim(), end];
}

export function decodeTokenMetadata(data: Uint8Array, expectedMint: PublicKey) {
  if (data.length < 69) throw new Error("Metadata account is too short");
  const mint = new PublicKey(data.slice(33, 65));
  if (!mint.equals(expectedMint)) throw new Error("Metadata mint mismatch");
  const [name, symbolOffset] = borshString(data, 65);
  const [symbol] = borshString(data, symbolOffset);
  if (!name && !symbol) throw new Error("Metadata has no token identity");
  return { name: name || null, symbol: symbol || null };
}

export function decodeToken2022Metadata(data: Uint8Array, expectedMint: PublicKey) {
  let offset = TOKEN_2022_TLV_OFFSET;
  while (offset + 4 <= data.length) {
    const extensionType = data[offset] | (data[offset + 1] << 8);
    const extensionLength = data[offset + 2] | (data[offset + 3] << 8);
    if (extensionType === 0 && extensionLength === 0) break;
    const valueOffset = offset + 4;
    const next = valueOffset + extensionLength;
    if (next > data.length) throw new Error("Malformed Token-2022 metadata extension");
    if (extensionType === TOKEN_METADATA_EXTENSION) {
      if (extensionLength < 72) throw new Error("Token-2022 metadata extension is too short");
      const mint = new PublicKey(data.slice(valueOffset + 32, valueOffset + 64));
      if (!mint.equals(expectedMint)) throw new Error("Token-2022 metadata mint mismatch");
      const [name, symbolOffset] = borshString(data, valueOffset + 64);
      const [symbol] = borshString(data, symbolOffset);
      if (!name && !symbol) throw new Error("Token-2022 metadata has no token identity");
      return { name: name || null, symbol: symbol || null };
    }
    offset = next;
  }
  return null;
}

export async function tokenMetadata(connection: Connection, mint: PublicKey) {
  const [address] = PublicKey.findProgramAddressSync(
    [Buffer.from("metadata"), METADATA_PROGRAM.toBuffer(), mint.toBuffer()],
    METADATA_PROGRAM,
  );
  const [mintAccount, account] = await Promise.all([
    connection.getAccountInfo(mint, "finalized"),
    connection.getAccountInfo(address, "finalized"),
  ]);
  if (mintAccount?.owner.equals(TOKEN_2022_PROGRAM)) {
    try {
      const embedded = decodeToken2022Metadata(mintAccount.data, mint);
      if (embedded) return embedded;
    } catch {
      // Fall through to canonical Metaplex metadata when embedded metadata is malformed.
    }
  }
  if (!account || !account.owner.equals(METADATA_PROGRAM)) return { name: null, symbol: null };
  try {
    return decodeTokenMetadata(account.data, mint);
  } catch {
    return { name: null, symbol: null };
  }
}
