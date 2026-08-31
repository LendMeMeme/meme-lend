import { PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { decodeTokenMetadata } from "./metadata.js";

const string = (value: string) => {
  const bytes = Buffer.from(value);
  const length = Buffer.alloc(4);
  length.writeUInt32LE(bytes.length);
  return Buffer.concat([length, bytes]);
};

describe("token metadata", () => {
  it("decodes and trims the verified mint name and symbol", () => {
    const mint = PublicKey.unique();
    const data = Buffer.concat([
      Buffer.from([4]),
      PublicKey.unique().toBuffer(),
      mint.toBuffer(),
      string("Meme Coin\0\0"),
      string("MEME\0"),
    ]);
    expect(decodeTokenMetadata(data, mint)).toEqual({ name: "Meme Coin", symbol: "MEME" });
  });
});
