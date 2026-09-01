import { PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { decodeToken2022Metadata, decodeTokenMetadata } from "./metadata.js";

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

  it("decodes metadata embedded in a Token-2022 mint", () => {
    const mint = PublicKey.unique(),
      name = Buffer.from("Pump Coin"),
      symbol = Buffer.from("PUMP"),
      uri = Buffer.from("https://example.com/token.json");
    const string = (value: Buffer) => {
      const encoded = Buffer.alloc(4 + value.length);
      encoded.writeUInt32LE(value.length);
      value.copy(encoded, 4);
      return encoded;
    };
    const value = Buffer.concat([
      Buffer.alloc(32),
      mint.toBuffer(),
      string(name),
      string(symbol),
      string(uri),
      Buffer.alloc(4),
    ]);
    const data = Buffer.alloc(166 + 4 + value.length);
    data.writeUInt16LE(19, 166);
    data.writeUInt16LE(value.length, 168);
    value.copy(data, 170);

    expect(decodeToken2022Metadata(data, mint)).toEqual({
      name: "Pump Coin",
      symbol: "PUMP",
    });
  });
});
