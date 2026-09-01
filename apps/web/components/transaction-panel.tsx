"use client";
import { useState } from "react";
import { useConnection, useWallet } from "@/components/wallet-context";
import {
  buildBorrowWithCollateralTransaction,
  buildMarketTransaction,
  type MarketAction,
} from "@/lib/transactions";
import { confirmSignatureByPolling } from "@/lib/confirmation";
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
  const [collateralAmount, setCollateralAmount] = useState("");
  const [marketInput, setMarketInput] = useState("");
  const [borrower, setBorrower] = useState("");
  const [status, setStatus] = useState<
    "idle" | "checking" | "sending" | "confirming" | "confirmed" | "failed"
  >("idle");
  const [message, setMessage] = useState("");
  const fieldSuffix = action.toLowerCase().replaceAll(" ", "-");
  const valid =
    Number.isFinite(Number(amount)) &&
    Number(amount) > 0 &&
    (action !== "Borrow" ||
      (Number.isFinite(Number(collateralAmount)) && Number(collateralAmount) > 0)) &&
    (action !== "Withdraw" || /^\d+$/.test(amount));
  const selectedMarket = market ?? marketInput;
  const submit = async () => {
    if (!connected || !publicKey || !selectedMarket || !valid) return;
    setStatus("checking");
    setMessage("");
    try {
      const transaction =
        action === "Borrow"
          ? await buildBorrowWithCollateralTransaction({
              collateralAmount,
              borrowAmount: amount,
              market: selectedMarket,
              owner: publicKey,
              connection,
            })
          : await buildMarketTransaction({
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
      setStatus("sending");
      const signature = await sendTransaction(transaction, connection, {
        preflightCommitment: "confirmed",
      });
      setStatus("confirming");
      await confirmSignatureByPolling(connection, signature, latest);
      setMessage(`Confirmed transaction ${signature}`);
      setStatus("confirmed");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Transaction failed");
      setStatus("failed");
    }
  };
  return (
    <div className="card panel">
      <h2>{action}</h2>
      <div className="field">
        <label htmlFor={`amount-${fieldSuffix}`}>
          {action === "Withdraw"
            ? "Supply shares to burn"
            : action === "Borrow"
              ? "USDC you want to borrow"
              : "Amount"}
        </label>
        <input
          id={`amount-${fieldSuffix}`}
          inputMode={action === "Withdraw" ? "numeric" : "decimal"}
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            setStatus("idle");
          }}
          placeholder={action === "Withdraw" ? "0" : "0.00"}
        />
        <span className="help">
          {action === "Withdraw"
            ? "Enter an integer share amount. The token proceeds and account constraints are checked by a fresh simulation before signing."
            : "Fees and resulting health are calculated from a fresh simulation before signing."}
        </span>
      </div>
      {action === "Borrow" ? (
        <div className="field">
          <label htmlFor="borrow-collateral">Memecoin collateral you will deposit</label>
          <input
            id="borrow-collateral"
            inputMode="decimal"
            value={collateralAmount}
            onChange={(event) => {
              setCollateralAmount(event.target.value);
              setStatus("idle");
            }}
            placeholder="0.00"
          />
          <span className="help">
            One wallet approval deposits this collateral and borrows your USDC together. The
            transaction stops safely if the collateral is not enough.
          </span>
        </div>
      ) : null}
      {!market ? (
        <div className="field">
          <label htmlFor={`market-address-${fieldSuffix}`}>Market address</label>
          <input
            id={`market-address-${fieldSuffix}`}
            value={marketInput}
            onChange={(event) => {
              setMarketInput(event.target.value);
              setStatus("idle");
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
          !connected ||
          !valid ||
          !selectedMarket ||
          status === "checking" ||
          status === "sending" ||
          status === "confirming"
        }
        onClick={submit}
      >
        {!connected
          ? "Connect wallet to continue"
          : !selectedMarket
            ? "Select a market to continue"
            : status === "checking"
              ? "Checking RPC…"
              : status === "sending"
                ? "Approve in wallet…"
                : status === "confirming"
                  ? "Confirming on Solana…"
                  : status === "confirmed"
                    ? "Confirmed"
                    : `${action} now`}
      </button>
    </div>
  );
}
