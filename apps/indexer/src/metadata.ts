import { Connection, PublicKey } from "@solana/web3.js";

const METADATA_PROGRAM = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

function borshString(data: Uint8Array, offset: number): [string, number] {
  if (offset + 4 > data.length) throw new Error("Invalid metadata string length");
  const length = new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(offset, true);
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

export async function tokenMetadata(connection: Connection, mint: PublicKey) {
  const [address] = PublicKey.findProgramAddressSync(
    [Buffer.from("metadata"), METADATA_PROGRAM.toBuffer(), mint.toBuffer()],
    METADATA_PROGRAM,
  );
  const account = await connection.getAccountInfo(address, "finalized");
  if (!account || !account.owner.equals(METADATA_PROGRAM)) return { name: null, symbol: null };
  try {
    return decodeTokenMetadata(account.data, mint);
  } catch {
    return { name: null, symbol: null };
  }
}
