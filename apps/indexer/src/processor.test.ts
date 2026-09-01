import { PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { eventRecords } from "./processor.js";

const signature = {
  signature: "sig",
  slot: 42,
  err: null,
  memo: null,
  blockTime: 1,
  confirmationStatus: "finalized" as const,
};

describe("eventRecords", () => {
  it("indexes optimized instructions without trusting program logs", () => {
    const programId = PublicKey.unique();
    const accounts = Array.from({ length: 6 }, () => PublicKey.unique());
    const transaction = {
      transaction: { message: { instructions: [{ programId, accounts, data: "2" }] } },
    } as never;
    const records = eventRecords(signature, transaction, programId);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      event: "MarketCreated",
      market: accounts[5].toBase58(),
      actor: accounts[0].toBase58(),
    });
  });

  it("attaches a creator-supplied market name from the transaction memo", () => {
    const programId = PublicKey.unique();
    const accounts = Array.from({ length: 6 }, () => PublicKey.unique());
    const transaction = {
      transaction: {
        message: {
          instructions: [
            {
              programId: new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"),
              parsed: "lend-meme-loans:market-name:GPRO Growth Market",
            },
            { programId, accounts, data: "2" },
          ],
        },
      },
    } as never;
    expect(eventRecords(signature, transaction, programId)[0]?.payload.marketName).toBe(
      "GPRO Growth Market",
    );
  });

  it("ignores instructions owned by another program", () => {
    const transaction = {
      transaction: {
        message: { instructions: [{ programId: PublicKey.unique(), accounts: [], data: "2" }] },
      },
    } as never;
    expect(eventRecords(signature, transaction, PublicKey.unique())).toEqual([]);
  });
});
