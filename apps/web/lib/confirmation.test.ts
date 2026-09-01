import type { Connection } from "@solana/web3.js";
import { describe, expect, it, vi } from "vitest";
import { confirmSignatureByPolling } from "./confirmation";

describe("confirmSignatureByPolling", () => {
  it("confirms over HTTP status polling without opening a websocket", async () => {
    const getSignatureStatuses = vi.fn().mockResolvedValue({
      value: [{ err: null, confirmationStatus: "confirmed" }],
    });
    const connection = { getSignatureStatuses } as unknown as Connection;

    await confirmSignatureByPolling(connection, "signature", { lastValidBlockHeight: 100 });

    expect(getSignatureStatuses).toHaveBeenCalledOnce();
  });

  it("surfaces an on-chain transaction error", async () => {
    const connection = {
      getSignatureStatuses: vi.fn().mockResolvedValue({
        value: [{ err: { InstructionError: [0, "InvalidAccountData"] } }],
      }),
    } as unknown as Connection;

    await expect(
      confirmSignatureByPolling(connection, "signature", { lastValidBlockHeight: 100 }),
    ).rejects.toThrow("InvalidAccountData");
  });

  it("checks once more and reports definitive blockhash expiry", async () => {
    vi.useFakeTimers();
    const connection = {
      getSignatureStatuses: vi.fn().mockResolvedValue({ value: [null] }),
      getBlockHeight: vi.fn().mockResolvedValue(101),
    } as unknown as Connection;
    const confirmation = confirmSignatureByPolling(connection, "signature", {
      lastValidBlockHeight: 100,
    });
    const rejected = expect(confirmation).rejects.toThrow("definitively expired");
    await vi.advanceTimersByTimeAsync(3_000);
    await rejected;
    expect(connection.getSignatureStatuses).toHaveBeenCalledTimes(6);
    vi.useRealTimers();
  });

  it("recovers from a temporary RPC status failure", async () => {
    vi.useFakeTimers();
    const connection = {
      getSignatureStatuses: vi
        .fn()
        .mockRejectedValueOnce(new Error("RPC unavailable"))
        .mockResolvedValueOnce({
          value: [{ err: null, confirmationStatus: "confirmed" }],
        }),
    } as unknown as Connection;
    const confirmation = confirmSignatureByPolling(connection, "signature", {
      lastValidBlockHeight: 100,
    });
    await vi.advanceTimersByTimeAsync(500);
    await expect(confirmation).resolves.toBeUndefined();
    vi.useRealTimers();
  });
});
