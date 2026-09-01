import {
  PublicKey,
  type ConfirmedSignatureInfo,
  type ParsedTransactionWithMeta,
} from "@solana/web3.js";
import type { IndexedTransaction } from "@meme-lend/shared";

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58(value: string): Uint8Array {
  const bytes: number[] = [0];
  for (const character of value) {
    const digit = ALPHABET.indexOf(character);
    if (digit < 0) throw new Error("Invalid base58 instruction data");
    let carry = digit;
    for (let index = 0; index < bytes.length; index += 1) {
      carry += bytes[index] * 58;
      bytes[index] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (const character of value) {
    if (character !== "1") break;
    bytes.push(0);
  }
  return Uint8Array.from(bytes.reverse());
}

const EVENTS = [
  "ProtocolInitialized",
  "MarketCreated",
  "ProtocolPauseChanged",
  "MarketPauseChanged",
  "InterestAccrued",
  "LiquiditySupplied",
  "LiquidityWithdrawn",
  "OracleObservationSubmitted",
  "CollateralDeposited",
  "CollateralWithdrawn",
  "Borrowed",
  "Repaid",
  "FirstLossReserveDeposited",
  "MarketCreatorFeesClaimed",
  "ProtocolFeesClaimed",
  "PositionLiquidated",
  "LenderRewardsFunded",
  "LenderRewardsClaimed",
] as const;
const MARKET_INDEX: Array<number | null> = [
  null,
  5,
  null,
  2,
  0,
  1,
  1,
  1,
  1,
  1,
  2,
  1,
  1,
  1,
  3,
  1,
  1,
  1,
];
const ACTOR_INDEX: Array<number | null> = [0, 0, 0, 0, null, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const AMOUNT_TAGS = new Set([5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
const MEMO_PROGRAM = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const MARKET_NAME_PREFIX = "lend-meme-loans:market-name:";

function marketNameMemo(transaction: ParsedTransactionWithMeta): string | null {
  for (const instruction of transaction.transaction.message.instructions) {
    if (!instruction.programId.equals(MEMO_PROGRAM)) continue;
    let memo: string | null = null;
    if ("parsed" in instruction && typeof instruction.parsed === "string")
      memo = instruction.parsed;
    else if ("data" in instruction) memo = new TextDecoder().decode(base58(instruction.data));
    if (memo?.startsWith(MARKET_NAME_PREFIX)) {
      const name = memo.slice(MARKET_NAME_PREFIX.length).trim();
      if (name.length >= 3 && name.length <= 50) return name;
    }
  }
  return null;
}

function little(data: Uint8Array, offset: number, length: number): bigint {
  let result = 0n;
  for (let index = length - 1; index >= 0; index -= 1)
    result = (result << 8n) | BigInt(data[offset + index] ?? 0);
  return result;
}

export function eventRecords(
  signature: ConfirmedSignatureInfo,
  transaction: ParsedTransactionWithMeta,
  programId: PublicKey,
): IndexedTransaction[] {
  const displayName = marketNameMemo(transaction);
  return transaction.transaction.message.instructions.flatMap((instruction, eventIndex) => {
    if (
      !("data" in instruction) ||
      !("accounts" in instruction) ||
      !instruction.programId.equals(programId)
    )
      return [];
    const bytes = base58(instruction.data),
      tag = bytes[0];
    if (tag === undefined || tag > 17) return [];
    const marketIndex = MARKET_INDEX[tag],
      actorIndex = ACTOR_INDEX[tag];
    const market =
      marketIndex === null ? null : (instruction.accounts[marketIndex]?.toBase58() ?? null);
    const actor =
      actorIndex === null ? null : (instruction.accounts[actorIndex]?.toBase58() ?? null);
    const payload: Record<string, unknown> = { tag };
    if (tag === 1 && displayName) payload.marketName = displayName;
    if (AMOUNT_TAGS.has(tag) && bytes.length >= 9)
      payload.amount = little(bytes, 1, tag === 6 ? 16 : 8).toString();
    return [
      {
        id: `${signature.signature}:${eventIndex}`,
        signature: signature.signature,
        eventIndex,
        slot: signature.slot,
        blockTime:
          signature.blockTime == null ? null : new Date(signature.blockTime * 1000).toISOString(),
        market,
        event: EVENTS[tag],
        actor,
        payload,
      },
    ];
  });
}
