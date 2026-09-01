import { describe, expect, it } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { decodePumpLifecycle, PUMP_PROGRAM_ID } from "./pump-status.js";

const discriminator = [23, 183, 248, 55, 96, 216, 172, 96];

describe("Pump collateral lifecycle", () => {
  it("distinguishes pre-bond and graduated curves", () => {
    const data = new Uint8Array(49);
    data.set(discriminator);
    expect(decodePumpLifecycle(PUMP_PROGRAM_ID, data)).toBe("pump-prebond");
    data[48] = 1;
    expect(decodePumpLifecycle(PUMP_PROGRAM_ID, data)).toBe("pump-graduated");
  });

  it("does not classify unrelated accounts as Pump curves", () => {
    expect(decodePumpLifecycle(PublicKey.default, new Uint8Array(49))).toBe("unknown");
    expect(decodePumpLifecycle(null, null)).toBe("other");
  });
});
