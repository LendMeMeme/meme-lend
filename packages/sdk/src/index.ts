import { PublicKey } from "@solana/web3.js";
export { createMemeLendProgram, MEME_LEND_IDL } from "./program.js";
export type { MemeLending } from "./idl/meme_lending.js";
export * from "./pinocchio.js";
export * from "./token.js";

export const RATE_SCALE = 1_000_000_000_000_000_000n;
export const BPS = 10_000n;

export function marketPda(programId: PublicKey, configHash: Uint8Array): [PublicKey, number] {
  if (configHash.length !== 32) throw new Error("Market configuration hash must be 32 bytes");
  return PublicKey.findProgramAddressSync(
    [Buffer.from("market"), Buffer.from(configHash)],
    programId,
  );
}
export function marketAuthorityPda(programId: PublicKey, market: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("market-authority"), market.toBuffer()],
    programId,
  );
}
export function lenderPositionPda(
  programId: PublicKey,
  market: PublicKey,
  owner: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("lender"), market.toBuffer(), owner.toBuffer()],
    programId,
  );
}
export function borrowerPositionPda(
  programId: PublicKey,
  market: PublicKey,
  owner: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("borrower"), market.toBuffer(), owner.toBuffer()],
    programId,
  );
}
export function mulDivFloor(a: bigint, b: bigint, denominator: bigint): bigint {
  if (denominator <= 0n || a < 0n || b < 0n)
    throw new Error("Invalid unsigned fixed-point operands");
  return (a * b) / denominator;
}
export function mulDivCeil(a: bigint, b: bigint, denominator: bigint): bigint {
  if (denominator <= 0n || a < 0n || b < 0n)
    throw new Error("Invalid unsigned fixed-point operands");
  return (a * b + denominator - 1n) / denominator;
}
export function healthFactorBps(
  collateralValue: bigint,
  debt: bigint,
  lltvBps: number,
): bigint | null {
  if (debt === 0n) return null;
  return mulDivFloor(collateralValue, BigInt(lltvBps) * BPS, debt * BPS);
}
export function transactionExplorerUrl(
  signature: string,
  cluster: "localnet" | "devnet" | "mainnet-beta",
): string | null {
  if (cluster === "localnet") return null;
  return `https://explorer.solana.com/tx/${encodeURIComponent(signature)}?cluster=${cluster}`;
}
