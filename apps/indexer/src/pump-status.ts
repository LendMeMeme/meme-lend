import { Connection, PublicKey } from "@solana/web3.js";

export const PUMP_PROGRAM_ID = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
const PUMP_CURVE_DISCRIMINATOR = Uint8Array.from([23, 183, 248, 55, 96, 216, 172, 96]);

export function decodePumpLifecycle(
  owner: PublicKey | null,
  data: Uint8Array | null,
): "pump-prebond" | "pump-graduated" | "other" | "unknown" {
  if (!owner || !data) return "other";
  if (!owner.equals(PUMP_PROGRAM_ID)) return "unknown";
  if (data.length < 49 || !PUMP_CURVE_DISCRIMINATOR.every((value, index) => data[index] === value))
    return "unknown";
  return data[48] === 0 ? "pump-prebond" : "pump-graduated";
}

export async function pumpLifecycle(
  connection: Connection,
  mint: PublicKey,
): Promise<"pump-prebond" | "pump-graduated" | "other" | "unknown"> {
  const [curve] = PublicKey.findProgramAddressSync(
    [Buffer.from("bonding-curve"), mint.toBuffer()],
    PUMP_PROGRAM_ID,
  );
  try {
    const info = await connection.getAccountInfo(curve, "finalized");
    return decodePumpLifecycle(info?.owner ?? null, info?.data ?? null);
  } catch {
    return "unknown";
  }
}
