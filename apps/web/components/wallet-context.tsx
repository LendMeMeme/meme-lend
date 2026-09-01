"use client";

import {
  ConnectionProvider,
  WalletProvider,
  useConnection,
  useWallet,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { useMemo } from "react";

export function WalletContext({ children }: { children: React.ReactNode }) {
  const endpoint = useMemo(
    () =>
      typeof window === "undefined"
        ? "http://127.0.0.1:3000/api/solana-rpc"
        : `${window.location.origin}/api/solana-rpc`,
    [],
  );
  return (
    <ConnectionProvider endpoint={endpoint} config={{ commitment: "confirmed" }}>
      <WalletProvider wallets={[]} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

export { useConnection, useWallet };
