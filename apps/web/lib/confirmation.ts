import type { Commitment, Connection, SignatureStatus } from "@solana/web3.js";

type ConfirmationWindow = { lastValidBlockHeight: number };

const reachedCommitment = (status: SignatureStatus, commitment: Commitment) => {
  if (commitment === "processed") return true;
  if (commitment === "confirmed")
    return status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized";
  return status.confirmationStatus === "finalized";
};

export async function confirmSignatureByPolling(
  connection: Connection,
  signature: string,
  blockhash: ConfirmationWindow,
  commitment: Commitment = "confirmed",
) {
  const deadline = Date.now() + 180_000;
  let polls = 0;
  let lastRpcError: unknown = null;
  while (Date.now() < deadline) {
    try {
      const status = (
        await connection.getSignatureStatuses([signature], { searchTransactionHistory: true })
      ).value[0];
      if (status?.err) throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
      if (status && reachedCommitment(status, commitment)) return;
      lastRpcError = null;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Transaction failed:")) throw error;
      lastRpcError = error;
    }

    if (++polls % 5 === 0) {
      try {
        const blockHeight = await connection.getBlockHeight(commitment);
        if (blockHeight > blockhash.lastValidBlockHeight) {
          const finalStatus = (
            await connection.getSignatureStatuses([signature], { searchTransactionHistory: true })
          ).value[0];
          if (finalStatus?.err)
            throw new Error(`Transaction failed: ${JSON.stringify(finalStatus.err)}`);
          if (finalStatus && reachedCommitment(finalStatus, commitment)) return;
          throw new Error(
            `Transaction ${signature} definitively expired before confirmation. It is safe to retry.`,
          );
        }
      } catch (error) {
        if (
          error instanceof Error &&
          (error.message.startsWith("Transaction failed:") || error.message.includes("expired"))
        )
          throw error;
        lastRpcError = error;
      }
    }
    await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 500));
  }
  throw new Error(
    `Transaction ${signature} is still unresolved after 180 seconds${lastRpcError instanceof Error ? ` because RPC checks failed: ${lastRpcError.message}` : ""}. Check its signature before retrying.`,
  );
}
