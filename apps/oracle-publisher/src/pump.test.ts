import { describe, expect, it } from "vitest";
import { PublicKey } from "@solana/web3.js";
import {
  decodePumpCurve,
  integerDeviationBps,
  PUMP_CURVE_DISCRIMINATOR,
  pumpSellQuote,
} from "./pump.js";

const u64 = (value: bigint) => {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(value);
  return bytes;
};

describe("official Pump bonding curve", () => {
  it("decodes the official account layout and caps output by real reserves", () => {
    const data = Buffer.concat([
      PUMP_CURVE_DISCRIMINATOR,
      u64(1_000_000n),
      u64(30_000n),
      u64(700_000n),
      u64(600n),
      u64(1_000_000n),
      Buffer.from([0]),
      PublicKey.default.toBuffer(),
      Buffer.from([0, 0]),
      PublicKey.default.toBuffer(),
    ]);
    const curve = decodePumpCurve(data);
    expect(curve.complete).toBe(false);
    expect(pumpSellQuote(curve, 100_000n)).toBe(600n);
  });

  it("rejects a spoofed discriminator", () => {
    expect(() => decodePumpCurve(Buffer.alloc(115))).toThrow("invalid account data");
  });

  it("rounds quote disagreement against admission", () => {
    expect(integerDeviationBps(100n, 104n)).toBe(400);
  });
});
