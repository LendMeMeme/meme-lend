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
});
