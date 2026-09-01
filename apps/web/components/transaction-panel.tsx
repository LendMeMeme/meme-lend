"use client";
import { useEffect, useRef, useState } from "react";
import { useConnection, useWallet } from "@/components/wallet-context";
import {
  buildBorrowWithCollateralTransaction,
  calculateBorrowCollateral,
  calculateWithdrawQuote,
  buildMarketTransaction,
  getSupplyWalletBalance,
  type MarketAction,
} from "@/lib/transactions";
import { confirmSignatureByPolling } from "@/lib/confirmation";
type Action = MarketAction;
type BorrowQuote = Awaited<ReturnType<typeof calculateBorrowCollateral>>;
type WithdrawQuote = Awaited<ReturnType<typeof calculateWithdrawQuote>>;
type OracleRefreshResult = {
  accepted?: boolean;
  published?: boolean;
  errors?: string[];
  error?: string;
};

async function refreshOracle(market: string): Promise<OracleRefreshResult> {
  const response = await fetch("/api/oracle-refresh", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ market }),
  });
  const result = (await response.json().catch(() => ({}))) as OracleRefreshResult;
  if (!response.ok && !result.errors?.length)
    throw new Error(result.error || `Oracle refresh service returned HTTP ${response.status}`);
  return result;
}

function borrowLimitMessage(quote: BorrowQuote): string {
  switch (quote.limitingCode) {
    case "AVAILABLE_LIQUIDITY":
      return `This market currently has ${quote.availableUsdc} USDC available.`;
    case "MARKET_CAP":
      return `This market's remaining borrowing limit is ${quote.remainingMarketCapUsdc} USDC.`;
    case "WALLET_CAP":
      return `Your remaining wallet borrowing limit is ${quote.remainingWalletCapUsdc} USDC.`;
    case "ORACLE_LIQUIDITY":
      return `The oracle currently supports ${quote.remainingOracleUsdc} USDC of additional borrowing for this wallet.`;
    default:
      return "No borrowing constraint is currently limiting this amount.";
  }
}
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
  const [borrowQuote, setBorrowQuote] = useState<BorrowQuote | null>(null);
  const oracleRefreshError = useRef("");
  const [supplyBalance, setSupplyBalance] = useState("");
  const [withdrawQuote, setWithdrawQuote] = useState<WithdrawQuote | null>(null);
  const [marketInput, setMarketInput] = useState("");
  const [borrower, setBorrower] = useState("");
  const [status, setStatus] = useState<
    "idle" | "checking" | "sending" | "confirming" | "confirmed" | "failed"
  >("idle");
  const [message, setMessage] = useState("");
  const [signature, setSignature] = useState("");
  const fieldSuffix = action.toLowerCase().replaceAll(" ", "-");
  const valid = Number.isFinite(Number(amount)) && Number(amount) > 0;
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
    if (action !== "Withdraw" || !publicKey || !selectedMarket) {
      setWithdrawQuote(null);
      return;
    }
    let cancelled = false;
    void calculateWithdrawQuote({ market: selectedMarket, owner: publicKey, connection })
      .then((quote) => {
        if (!cancelled) setWithdrawQuote(quote);
      })
      .catch(() => {
        if (!cancelled) setWithdrawQuote(null);
      });
    return () => {
      cancelled = true;
    };
  }, [action, connection, publicKey, selectedMarket]);
  useEffect(() => {
    if (action !== "Borrow" || !publicKey || !selectedMarket || !valid) {
      setCollateralAmount("");
      setCollateralQuote("");
      setBorrowQuote(null);
      oracleRefreshError.current = "";
      return;
    }
    let cancelled = false;
    void refreshOracle(selectedMarket)
      .then((result) => {
        if (!cancelled) oracleRefreshError.current = result.errors?.join(" Backup: ") ?? "";
      })
      .catch((cause) => {
        if (!cancelled) {
          oracleRefreshError.current =
            cause instanceof Error ? cause.message : "Oracle refresh service is unreachable";
        }
      });
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
            setBorrowQuote(quote);
            setCollateralQuote(
              quote.hasEnoughCollateral
                ? `You need ${quote.collateralAmount} ${collateralSymbol ?? "memecoin"}. Your wallet has ${quote.walletCollateralAmount}.`
                : `You need ${quote.collateralAmount} ${collateralSymbol ?? "memecoin"}, but your wallet has ${quote.walletCollateralAmount}. Get ${quote.missingCollateralAmount} more to borrow this amount.`,
            );
            oracleRefreshError.current = "";
          }
        })
        .catch((cause) => {
          if (!cancelled) {
            setCollateralAmount("");
            setBorrowQuote(null);
            const quoteError = cause instanceof Error ? cause.message : "Collateral unavailable";
            setCollateralQuote(
              oracleRefreshError.current
                ? `${quoteError} Publisher detail: ${oracleRefreshError.current}`
                : quoteError,
            );
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
      if (action === "Borrow") {
        const refresh = await refreshOracle(selectedMarket);
        if (!refresh.accepted && refresh.errors?.length)
          throw new Error(`Oracle refresh failed: ${refresh.errors.join(" Backup: ")}`);
      }
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
      if (automaticCollateral && !automaticCollateral.requestedAmountAllowed)
        throw new Error(
          `You requested ${automaticCollateral.requestedUsdc} USDC, but the current maximum is ${automaticCollateral.maximumBorrowUsdc} USDC. ${borrowLimitMessage(automaticCollateral)}`,
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
            ? "USDC to withdraw"
            : action === "Borrow"
              ? "USDC you want to borrow"
              : "Amount"}
        </label>
        <input
          id={`amount-${fieldSuffix}`}
          inputMode="decimal"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            setStatus("idle");
          }}
          placeholder="0.00"
        />
        <span className="help">
          {action === "Withdraw"
            ? "Enter a normal USDC amount. The app converts it to lender shares automatically using current on-chain accounting."
            : "Fees and resulting health are calculated from a fresh simulation before signing."}
        </span>
      </div>
      {action === "Withdraw" && publicKey ? (
        <div className="estimate-box">
          <strong>Your withdrawal</strong>
          <span>
            Available now: {withdrawQuote ? `${withdrawQuote.maximumUsdc} USDC` : "Checking…"}
          </span>
          {withdrawQuote ? (
            <>
              <small>Total lender claim: {withdrawQuote.totalClaimUsdc} USDC</small>
              <button
                type="button"
                className="button secondary"
                disabled={Number(withdrawQuote.maximumUsdc) <= 0}
                onClick={() => {
                  setAmount(withdrawQuote.maximumUsdc);
                  setStatus("idle");
                }}
              >
                Withdraw maximum
              </button>
            </>
          ) : null}
        </div>
      ) : null}
      {action === "Borrow" ? (
        <>
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
          {borrowQuote ? (
            <div className="estimate-box">
              <strong>What you can borrow right now</strong>
              <span>Maximum: {borrowQuote.maximumBorrowUsdc} USDC</span>
              <small>{borrowLimitMessage(borrowQuote)}</small>
              <small>
                Market cash {borrowQuote.availableUsdc} · Market cap remaining{" "}
                {borrowQuote.remainingMarketCapUsdc} · Wallet cap remaining{" "}
                {borrowQuote.remainingWalletCapUsdc} · Oracle limit remaining{" "}
                {borrowQuote.remainingOracleUsdc} USDC
              </small>
              <small>
                Oracle updated {borrowQuote.oracleAgeSeconds}s ago and remains valid for{" "}
                {borrowQuote.oracleMaxAgeSeconds}s.
              </small>
              {!borrowQuote.requestedAmountAllowed && Number(borrowQuote.maximumBorrowUsdc) > 0 ? (
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => {
                    setAmount(borrowQuote.maximumBorrowUsdc);
                    setStatus("idle");
                  }}
                >
                  Use maximum
                </button>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
      {action === "Supply" && publicKey ? (
        <div className="field">
          <span className="field-label">Available in your wallet</span>
          <strong className="calculated-value">
            {supplyBalance ? `${supplyBalance} USDC` : "Checking…"}
          </strong>
          <span className="help">
            {valid && Number(amount) > Number(supplyBalance)
              ? `You entered ${amount} USDC, but this wallet contains ${supplyBalance || "0"} USDC.`
              : "This is the most USDC you can supply from this wallet right now."}
          </span>
          {valid && Number(amount) > Number(supplyBalance) && Number(supplyBalance) > 0 ? (
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                setAmount(supplyBalance);
                setStatus("idle");
              }}
            >
              Supply maximum
            </button>
          ) : null}
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
