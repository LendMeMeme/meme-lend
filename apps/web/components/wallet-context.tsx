"use client";
import { Connection, PublicKey, type Transaction } from "@solana/web3.js";
import { createContext, useContext, useMemo, useState } from "react";

type InjectedWallet = {
  publicKey?: { toString(): string };
  connect(): Promise<{ publicKey: { toString(): string } }>;
  disconnect(): Promise<void>;
  signTransaction(transaction: Transaction): Promise<Transaction>;
};
declare global {
  interface Window {
    solana?: InjectedWallet;
    phantom?: { solana?: InjectedWallet };
    solflare?: InjectedWallet;
  }
}
type WalletState = {
  connection: Connection;
  connected: boolean;
  publicKey: PublicKey | null;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  sendTransaction(
    transaction: Transaction,
    connection?: Connection,
    options?: { preflightCommitment?: "confirmed" },
  ): Promise<string>;
};
const Context = createContext<WalletState | null>(null);

export function WalletContext({ children }: { children: React.ReactNode }) {
  const connection = useMemo(
    () =>
      new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC_HTTP ?? "http://127.0.0.1:8899", {
        commitment: "confirmed",
        wsEndpoint: process.env.NEXT_PUBLIC_SOLANA_RPC_WS,
      }),
    [],
  );
  const [provider, setProvider] = useState<InjectedWallet | null>(null);
  const [publicKey, setPublicKey] = useState<PublicKey | null>(null);
  const selected = () => window.phantom?.solana ?? window.solflare ?? window.solana;
  const value: WalletState = {
    connection,
    connected: publicKey !== null,
    publicKey,
    async connect() {
      const next = selected();
      if (!next) throw new Error("Install Phantom or Solflare to connect a Solana wallet");
      const response = await next.connect();
      setProvider(next);
      setPublicKey(new PublicKey(response.publicKey.toString()));
    },
    async disconnect() {
      await provider?.disconnect();
      setProvider(null);
      setPublicKey(null);
    },
    async sendTransaction(transaction, selectedConnection = connection, options) {
      if (!provider || !publicKey) throw new Error("Connect a wallet first");
      const signed = await provider.signTransaction(transaction);
      return selectedConnection.sendRawTransaction(signed.serialize(), {
        preflightCommitment: options?.preflightCommitment ?? "confirmed",
      });
    },
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useWallet() {
  const value = useContext(Context);
  if (!value) throw new Error("WalletContext is missing");
  return value;
}
export function useConnection() {
  return { connection: useWallet().connection };
}
