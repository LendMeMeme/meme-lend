"use client";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { ChevronDown, Wallet } from "lucide-react";
import { useWallet } from "@/components/wallet-context";
export function WalletControl() {
  const { connected, connecting, disconnecting, publicKey, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const address = publicKey?.toBase58();
  const label = address ? `${address.slice(0, 4)}…${address.slice(-4)}` : "Connect wallet";
  const busy = connecting || disconnecting;
  return (
    <button
      className="wallet-adapter-button"
      disabled={busy}
      onClick={() => {
        if (connected) void disconnect();
        else setVisible(true);
      }}
      title={connected ? "Disconnect wallet" : "Choose a Solana wallet"}
      aria-label={connected ? `Wallet ${address}. Disconnect wallet` : "Choose a Solana wallet"}
    >
      <Wallet aria-hidden="true" size={16} />
      {busy ? "Opening…" : label}
      {!connected ? <ChevronDown aria-hidden="true" size={14} /> : null}
    </button>
  );
}
