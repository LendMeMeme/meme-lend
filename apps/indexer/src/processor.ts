import type { ConfirmedSignatureInfo, ParsedTransactionWithMeta } from "@solana/web3.js";
import type { IndexedTransaction } from "@meme-lend/shared";
import { BorshEventCoder, BN } from "@coral-xyz/anchor";
import { MEME_LEND_IDL } from "@meme-lend/sdk";

const eventCoder = new BorshEventCoder(MEME_LEND_IDL);

function jsonValue(value: unknown): unknown {
  if (BN.isBN(value)) return (value as BN).toString(10);
  if (value && typeof value === "object" && "toBase58" in value) {
    const toBase58 = (value as { toBase58?: () => string }).toBase58;
    if (typeof toBase58 === "function") return toBase58.call(value);
  }
  if (Array.isArray(value)) return value.map(jsonValue);
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, jsonValue(child)]));
  return value;
}

export function eventRecords(
  signature: ConfirmedSignatureInfo,
  transaction: ParsedTransactionWithMeta,
): IndexedTransaction[] {
  const logs = transaction.meta?.logMessages ?? [];
  return logs.flatMap((line, eventIndex) => {
    const marker = "Program data: ";
    if (!line.startsWith(marker)) return [];
    const decoded = eventCoder.decode(line.slice(marker.length));
    if (!decoded) return [];
    const payload = jsonValue(decoded.data) as Record<string, unknown>;
    const market = typeof payload.market === "string" ? payload.market : null;
    const actorKeys = [
      "lender",
      "borrower",
      "payer",
      "liquidator",
      "creator",
      "funder",
      "contributor",
      "publisher",
      "recipient",
    ];
    const actor =
      actorKeys
        .map((key) => payload[key])
        .find((value): value is string => typeof value === "string") ?? null;
    return [
      {
        id: `${signature.signature}:${eventIndex}`,
        signature: signature.signature,
        eventIndex,
        slot: signature.slot,
        blockTime:
          signature.blockTime == null ? null : new Date(signature.blockTime * 1000).toISOString(),
        market,
        event: decoded.name,
        actor,
        payload,
      },
    ];
  });
}
