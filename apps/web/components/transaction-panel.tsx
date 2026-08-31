"use client";
import { useState } from "react";
import { useConnection, useWallet } from "@/components/wallet-context";
import type { Transaction } from "@solana/web3.js";
import { buildMarketTransaction, type MarketAction } from "@/lib/transactions";
type Action = MarketAction;
export function TransactionPanel({
  action,
  market,
  risk,
}: {
  action: Action;
  market?: string;
  risk: string;
}) {
  const wallet = useWallet();
  const { connected, publicKey, sendTransaction } = wallet;
  const { connection } = useConnection();
  const [amount, setAmount] = useState("");
  const [marketInput, setMarketInput] = useState("");
  const [borrower, setBorrower] = useState("");
  const [status, setStatus] = useState<
    "idle" | "checking" | "reviewed" | "sending" | "confirmed" | "failed"
  >("idle");
  const [message, setMessage] = useState("");
  const [reviewed, setReviewed] = useState<Transaction | null>(null);
  const fieldSuffix = action.toLowerCase().replaceAll(" ", "-");
  const valid =
    Number.isFinite(Number(amount)) &&
    Number(amount) > 0 &&
    (action !== "Withdraw" || /^\d+$/.test(amount));
  const selectedMarket = market ?? marketInput;
  const submit = async () => {
    if (!connected || !publicKey || !selectedMarket || !valid) return;
    setStatus("checking");
    try {
      const transaction = await buildMarketTransaction({
        action,
        amount,
        market: selectedMarket,
        owner: publicKey,
        connection,
        borrower: borrower || undefined,
      });
      const latest = await connection.getLatestBlockhash("confirmed");
      transaction.feePayer = publicKey;
      transaction.recentBlockhash = latest.blockhash;
      const simulation = await connection.simulateTransaction(transaction);
      if (simulation.value.err)
        throw new Error(`Simulation failed: ${JSON.stringify(simulation.value.err)}`);
      setReviewed(transaction);
      setMessage(
        "Simulation succeeded. Review the amount, market, and wallet prompt before submitting.",
      );
      setStatus("reviewed");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Transaction simulation failed");
      setStatus("failed");
    }
  };
  const send = async () => {
    if (!reviewed) return;
    setStatus("sending");
    try {
      const signature = await sendTransaction(reviewed, connection, {
        preflightCommitment: "confirmed",
      });
      const result = await connection.confirmTransaction(signature, "confirmed");
      if (result.value.err)
        throw new Error(`Transaction failed: ${JSON.stringify(result.value.err)}`);
      setMessage(`Confirmed transaction ${signature}`);
      setStatus("confirmed");
      setReviewed(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Wallet submission failed");
      setStatus("failed");
    }
  };
  return (
    <div className="card panel">
      <h2>{action}</h2>
      <div className="field">
        <label htmlFor={`amount-${fieldSuffix}`}>
          {action === "Withdraw" ? "Supply shares to burn" : "Exact token amount"}
        </label>
        <input
          id={`amount-${fieldSuffix}`}
          inputMode={action === "Withdraw" ? "numeric" : "decimal"}
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            setStatus("idle");
            setReviewed(null);
          }}
          placeholder={action === "Withdraw" ? "0" : "0.00"}
        />
        <span className="help">
          {action === "Withdraw"
            ? "Enter an integer share amount. The token proceeds and account constraints are checked by a fresh simulation before signing."
            : "Fees and resulting health are calculated from a fresh simulation before signing."}
        </span>
      </div>
      {!market ? (
        <div className="field">
          <label htmlFor={`market-address-${fieldSuffix}`}>Market address</label>
          <input
            id={`market-address-${fieldSuffix}`}
            value={marketInput}
            onChange={(event) => {
              setMarketInput(event.target.value);
              setStatus("idle");
              setReviewed(null);
            }}
            placeholder="Isolated market public key"
          />
        </div>
      ) : null}
      {action === "Liquidate" ? (
        <div className="field">
          <label htmlFor={`borrower-${fieldSuffix}`}>Borrower wallet</label>
          <input
            id={`borrower-${fieldSuffix}`}
            value={borrower}
            onChange={(event) => {
              setBorrower(event.target.value);
              setStatus("idle");
              setReviewed(null);
            }}
            placeholder="Borrower public key"
          />
        </div>
      ) : null}
      <div className="warning">{risk}</div>
      <dl>
        <div className="definition">
          <dt>Market</dt>
          <dd>{selectedMarket || "Select a market"}</dd>
        </div>
        <div className="definition">
          <dt>Resulting health</dt>
          <dd>Requires fresh oracle state</dd>
        </div>
      </dl>
      {message ? (
        <p role="status" className={status === "failed" ? "unavailable" : "help"}>
          {message}
        </p>
      ) : null}
      <button
        className="button primary"
        style={{ width: "100%" }}
        disabled={
          !connected || !valid || !selectedMarket || status === "checking" || status === "sending"
        }
        onClick={status === "reviewed" ? send : submit}
      >
        {!connected
          ? "Connect wallet to continue"
          : !selectedMarket
            ? "Select a market to continue"
            : status === "checking"
              ? "Checking RPC…"
              : status === "sending"
                ? "Waiting for wallet…"
                : status === "reviewed"
                  ? "Submit transaction"
                  : status === "confirmed"
                    ? "Confirmed"
                    : "Review transaction"}
      </button>
    </div>
  );
}
