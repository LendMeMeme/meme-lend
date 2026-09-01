"use client";
import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@/components/wallet-context";
import {
  buildBorrowWithCollateralTransaction,
  calculateBorrowCollateral,
  buildMarketTransaction,
  getSupplyWalletBalance,
  type MarketAction,
} from "@/lib/transactions";
import { confirmSignatureByPolling } from "@/lib/confirmation";
type Action = MarketAction;
export function TransactionPanel({
  action,
  market,
  risk,
  collateralSymbol,
  aprBps,
}: {
  action: Action;
  market?: string;
  risk: string;
  collateralSymbol?: string | null;
  aprBps?: number | null;
}) {
  const wallet = useWallet();
  const { connected, publicKey, sendTransaction } = wallet;
  const { connection } = useConnection();
  const [amount, setAmount] = useState("");
  const [collateralAmount, setCollateralAmount] = useState("");
  const [collateralQuote, setCollateralQuote] = useState("");
  const [supplyBalance, setSupplyBalance] = useState("");
  const [marketInput, setMarketInput] = useState("");
  const [borrower, setBorrower] = useState("");
  const [status, setStatus] = useState<
    "idle" | "checking" | "sending" | "confirming" | "confirmed" | "failed"
  >("idle");
  const [message, setMessage] = useState("");
  const [signature, setSignature] = useState("");
  const fieldSuffix = action.toLowerCase().replaceAll(" ", "-");
  const valid =
    Number.isFinite(Number(amount)) &&
    Number(amount) > 0 &&
    (action !== "Withdraw" || /^\d+$/.test(amount));
  const selectedMarket = market ?? marketInput;
  useEffect(() => {
    if (action !== "Supply" || !publicKey || !selectedMarket) {
      setSupplyBalance("");
      return;
    }
    let cancelled = false;
    void getSupplyWalletBalance({ market: selectedMarket, owner: publicKey, connection })
      .then((balance) => {
        if (!cancelled) setSupplyBalance(balance);
      })
      .catch(() => {
        if (!cancelled) setSupplyBalance("");
      });
    return () => {
      cancelled = true;
    };
  }, [action, connection, publicKey, selectedMarket]);
  useEffect(() => {
    if (action !== "Borrow" || !publicKey || !selectedMarket || !valid) {
      setCollateralAmount("");
      setCollateralQuote("");
      return;
    }
    let cancelled = false;
    void fetch("/api/oracle-refresh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ market: selectedMarket }),
    }).catch(() => undefined);
    const refreshQuote = () => {
      void calculateBorrowCollateral({
        borrowAmount: amount,
        market: selectedMarket,
        owner: publicKey,
        connection,
      })
        .then((quote) => {
          if (!cancelled) {
            setCollateralAmount(quote.collateralAmount);
            setCollateralQuote(
              quote.hasEnoughCollateral
                ? `You need ${quote.collateralAmount} ${collateralSymbol ?? "memecoin"}. Your wallet has ${quote.walletCollateralAmount}.`
                : `You need ${quote.collateralAmount} ${collateralSymbol ?? "memecoin"}, but your wallet has ${quote.walletCollateralAmount}. Get ${quote.missingCollateralAmount} more to borrow this amount.`,
            );
          }
        })
        .catch((cause) => {
          if (!cancelled) {
            setCollateralAmount("");
            setCollateralQuote(cause instanceof Error ? cause.message : "Collateral unavailable");
          }
        });
    };
    const timer = window.setTimeout(refreshQuote, 250);
    const interval = window.setInterval(refreshQuote, 5_000);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.clearInterval(interval);
    };
  }, [action, amount, connection, publicKey, selectedMarket, valid]);
  const submit = async () => {
    if (!connected || !publicKey || !selectedMarket || !valid) return;
    setStatus("checking");
    setMessage("");
    try {
      const automaticCollateral =
        action === "Borrow"
          ? await calculateBorrowCollateral({
              borrowAmount: amount,
              market: selectedMarket,
              owner: publicKey,
              connection,
            })
          : null;
      if (automaticCollateral && !automaticCollateral.hasEnoughCollateral)
        throw new Error(
          `You need ${automaticCollateral.collateralAmount} ${collateralSymbol ?? "memecoin"}, but your wallet has ${automaticCollateral.walletCollateralAmount}. Get ${automaticCollateral.missingCollateralAmount} more first.`,
        );
      const transaction =
        action === "Borrow"
          ? await buildBorrowWithCollateralTransaction({
              collateralAmount: automaticCollateral!.collateralAmount,
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
      setSignature(signature);
      setStatus("confirming");
      await confirmSignatureByPolling(connection, signature, latest);
      setMessage("Completed. Solana has confirmed your transaction.");
      setStatus("confirmed");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Transaction failed";
      setMessage(
        detail.includes("not confirmed") || detail.includes("30.00 seconds")
          ? "Confirmation is taking longer than expected. Your transaction may still succeed; check it on Solana Explorer before trying again."
          : detail,
      );
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
          <span className="field-label">Collateral added automatically</span>
          <strong className="calculated-value">
            {collateralAmount
              ? `${collateralAmount} ${collateralSymbol ?? "memecoin"}`
              : "Enter a USDC amount above"}
          </strong>
          <span className="help">
            {collateralQuote ||
              "The app uses the fresh on-chain oracle price and adds a safety buffer automatically."}
          </span>
        </div>
      ) : null}
      {action === "Supply" && publicKey ? (
        <div className="field">
          <span className="field-label">Available in your wallet</span>
          <strong className="calculated-value">
            {supplyBalance ? `${supplyBalance} USDC` : "Checking…"}
          </strong>
          <span className="help">
            This is the most USDC you can supply from this wallet right now.
          </span>
        </div>
      ) : null}
      {aprBps != null && valid && (action === "Supply" || action === "Borrow") ? (
        <div className="estimate-box">
          <strong>{action === "Supply" ? "Estimated earnings" : "Estimated interest cost"}</strong>
          <span>
            About{" "}
            {(((Number(amount) * (aprBps / 10_000)) / 365) * 30).toLocaleString(undefined, {
              maximumFractionDigits: 6,
            })}{" "}
            USDC over 30 days
          </span>
          <small>
            Assumes the current {aprBps / 100}% APR stays unchanged. Actual rates vary with
            borrowing.
          </small>
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
      {status !== "idle" ? (
        <ol className="transaction-steps" aria-label="Transaction progress">
          {["Preparing", "Waiting for approval", "Submitted", "Confirming", "Completed"].map(
            (label, index) => {
              const current = { checking: 0, sending: 1, confirming: 3, confirmed: 4, failed: -1 }[
                status
              ];
              return (
                <li className={current >= index ? "done" : ""} key={label}>
                  {label}
                </li>
              );
            },
          )}
        </ol>
      ) : null}
      {message ? (
        <p role="status" className={status === "failed" ? "unavailable" : "help"}>
          {message}
          {signature ? (
            <>
              {" "}
              <a
                className="text-link"
                href={`https://explorer.solana.com/tx/${signature}`}
                target="_blank"
                rel="noreferrer"
              >
                View transaction
              </a>
            </>
          ) : null}
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
              ? "Preparing…"
              : status === "sending"
                ? "Waiting for approval…"
                : status === "confirming"
                  ? "Confirming on Solana…"
                  : status === "confirmed"
                    ? "Confirmed"
                    : `${action} now`}
      </button>
    </div>
  );
}
