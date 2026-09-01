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
  const deadline = Date.now() + 45_000;
  let polls = 0;
  while (Date.now() < deadline) {
    const status = (
      await connection.getSignatureStatuses([signature], { searchTransactionHistory: true })
    ).value[0];
    if (status?.err) throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
    if (status && reachedCommitment(status, commitment)) return;

    if (++polls % 5 === 0) {
      const blockHeight = await connection.getBlockHeight(commitment);
      if (blockHeight > blockhash.lastValidBlockHeight)
        throw new Error(`Transaction ${signature} expired before confirmation`);
    }
    await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for transaction ${signature} to confirm`);
}
