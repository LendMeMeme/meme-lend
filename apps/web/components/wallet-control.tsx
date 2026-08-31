"use client";
import { useState } from "react";
import { useWallet } from "@/components/wallet-context";
export function WalletControl() {
  const wallet = useWallet();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const label = wallet.publicKey
    ? `${wallet.publicKey.toBase58().slice(0, 4)}…${wallet.publicKey.toBase58().slice(-4)}`
    : "Connect wallet";
  return (
    <button
      className="wallet-adapter-button"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        setError("");
        void (wallet.connected ? wallet.disconnect() : wallet.connect())
          .catch((cause: unknown) =>
            setError(cause instanceof Error ? cause.message : "Wallet connection failed"),
          )
          .finally(() => setBusy(false));
      }}
      title={error || undefined}
      aria-label={error || label}
    >
      {busy ? "Opening…" : label}
    </button>
  );
}
