import { describe, expect, it } from "vitest";
import { eventRecords } from "./processor.js";
describe("eventRecords", () => {
  it("ignores unknown program data instead of indexing opaque bytes", () => {
    const signature = {
      signature: "sig",
      slot: 42,
      err: null,
      memo: null,
      blockTime: 1,
      confirmationStatus: "finalized" as const,
    };
    const transaction = {
      meta: { logMessages: ["Program log: ignored", "Program data: AAA="] },
    } as never;
    expect(eventRecords(signature, transaction)).toEqual([]);
  });
});
