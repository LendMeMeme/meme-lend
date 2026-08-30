import { describe, expect, it } from "vitest";
import { healthFactorBps, mulDivCeil, mulDivFloor } from "./index.js";
describe("fixed point math", () => {
  it("rounds claims down and debt up", () => {
    expect(mulDivFloor(10n, 2n, 3n)).toBe(6n);
    expect(mulDivCeil(10n, 2n, 3n)).toBe(7n);
  });
  it("reports no finite health factor without debt", () => {
    expect(healthFactorBps(1n, 0n, 6500)).toBeNull();
  });
});
