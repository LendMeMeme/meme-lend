"use client";
import { useState } from "react";
import { useConnection, useWallet } from "@/components/wallet-context";
import type { Connection } from "@solana/web3.js";
import { buildCreateMarketTransaction, type RATE_MODELS } from "@/lib/transactions";

async function errorMessage(error: unknown, connection: Connection) {
  let logs: string[] | null = null;
  if (
    typeof error === "object" &&
    error !== null &&
    "getLogs" in error &&
    typeof error.getLogs === "function"
  ) {
    try {
      logs = await (error.getLogs as (connection: Connection) => Promise<string[]>)(connection);
    } catch {
      // Preserve the original wallet/RPC error when log retrieval is unavailable.
    }
  }
  const message = error instanceof Error ? error.message : "Market launch failed";
  return logs?.length ? `${message}\n${logs.slice(-8).join("\n")}` : message;
}

export function CreateMarketForm() {
  const wallet = useWallet();
  const { connection } = useConnection();
  const [collateralMint, setCollateralMint] = useState("");
  const [lltvBps, setLltvBps] = useState<3000 | 4000 | 5000 | 6000 | 6500>(5000);
  const [rateModel, setRateModel] = useState<keyof typeof RATE_MODELS>("conservative");
  const [marketCap, setMarketCap] = useState("");
  const [walletCap, setWalletCap] = useState("");
  const [initialLiquidity, setInitialLiquidity] = useState("");
  const [status, setStatus] = useState<
    "idle" | "preparing" | "sending" | "confirmed" | "failed"
  >("idle");
  const [message, setMessage] = useState("");
  const [fee, setFee] = useState<number | null>(null);
  const resetReview = () => {
    setStatus("idle");
    setMessage("");
    setFee(null);
  };
  const launch = async () => {
    if (!wallet.publicKey) return;
    setStatus("preparing");
    try {
      const result = await buildCreateMarketTransaction({
        collateralMint,
        lltvBps,
        rateModel,
        marketBorrowCap: marketCap,
        walletBorrowCap: walletCap,
        initialLiquidity,
        owner: wallet.publicKey,
        connection,
      });
      const latest = await connection.getLatestBlockhash("confirmed");
      result.transaction.feePayer = wallet.publicKey;
      result.transaction.recentBlockhash = latest.blockhash;
      const simulation = await connection.simulateTransaction(result.transaction);
      if (simulation.value.err) {
        const logs = simulation.value.logs?.slice(-6).join("\n");
        throw new Error(
          `Simulation failed: ${JSON.stringify(simulation.value.err)}${logs ? `\n${logs}` : ""}`,
        );
      }
      setFee(
        (await connection.getFeeForMessage(result.transaction.compileMessage(), "confirmed")).value,
      );
      setStatus("sending");
      const signature = await wallet.sendTransaction(result.transaction, connection, {
        preflightCommitment: "confirmed",
      });
      const confirmation = await connection.confirmTransaction(
        { signature, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight },
        "confirmed",
      );
      if (confirmation.value.err)
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      setMessage(
        `Market ${result.market.toBase58()} launched with ${initialLiquidity} USDC in transaction ${signature}`,
      );
      setStatus("confirmed");
    } catch (error) {
      setMessage(await errorMessage(error, connection));
      setStatus("failed");
    }
  };
  return (
    <section className="card panel span-7">
      <h2>Market configuration</h2>
      <div className="asset-pair" aria-label="Market asset pair">
        <div>
          <span>Borrow and lend</span>
          <strong>USDC</strong>
          <small>Fixed protocol loan asset</small>
        </div>
        <span className="asset-pair-arrow" aria-hidden="true">
          ↔
        </span>
        <div>
          <span>Collateral</span>
          <strong>Your memecoin</strong>
          <small>Selected by mint address below</small>
        </div>
      </div>
      <div className="field">
        <label htmlFor="collateral-mint">Memecoin collateral mint</label>
        <input
          id="collateral-mint"
          value={collateralMint}
          onChange={(e) => {
            setCollateralMint(e.target.value);
            resetReview();
          }}
          placeholder="Memecoin mint address"
        />
        <span className="help">
          Token-2022 mints with unsupported extensions are rejected by the program.
        </span>
      </div>
      <div className="field oracle-managed">
        <span className="field-label">Oracle service</span>
        <strong>Lend Meme Loans managed oracle</strong>
        <span className="help">
          Primary and backup publishers aggregate independent price sources and conservative DEX
          liquidity. If safe quorum is unavailable, publishing stops and the market fails closed:
          borrowing and collateral withdrawals stop while repayment and collateral deposits remain
          available.
        </span>
      </div>
      <div className="field">
        <label htmlFor="lltv">Liquidation LTV</label>
        <select
          id="lltv"
          value={lltvBps}
          onChange={(e) => {
            setLltvBps(Number(e.target.value) as 3000 | 4000 | 5000 | 6000 | 6500);
            resetReview();
          }}
        >
          <option value={5000}>50% — conservative preset</option>
          <option value={6000}>60% — standard preset</option>
          <option value={6500}>65% — higher leverage</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="rate-model">Interest model</label>
        <select
          id="rate-model"
          value={rateModel}
          onChange={(e) => {
            setRateModel(e.target.value as keyof typeof RATE_MODELS);
            resetReview();
          }}
        >
          <option value="conservative">Conservative low-liquidity asset</option>
          <option value="standard">Standard volatile asset</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="market-cap">Market borrow cap (USDC)</label>
        <input
          id="market-cap"
          inputMode="decimal"
          value={marketCap}
          onChange={(e) => {
            setMarketCap(e.target.value);
            resetReview();
          }}
        />
      </div>
      <div className="field">
        <label htmlFor="wallet-cap">Wallet borrow cap (USDC)</label>
        <input
          id="wallet-cap"
          inputMode="decimal"
          value={walletCap}
          onChange={(e) => {
            setWalletCap(e.target.value);
            resetReview();
          }}
        />
      </div>
      <div className="field">
        <label htmlFor="initial-liquidity">Initial USDC liquidity</label>
        <input
          id="initial-liquidity"
          inputMode="decimal"
          value={initialLiquidity}
          onChange={(e) => {
            setInitialLiquidity(e.target.value);
            resetReview();
          }}
          placeholder="Amount supplied when the market launches"
        />
        <span className="help">
          Market creation and the first USDC supply are atomic: either both succeed or neither does.
        </span>
      </div>
      <dl>
        <div className="definition">
          <dt>Network fee</dt>
          <dd>{fee == null ? "Calculated during simulation" : `${fee} lamports`}</dd>
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
          !wallet.connected ||
          status === "preparing" ||
          status === "sending" ||
          status === "confirmed"
        }
        onClick={launch}
      >
        {!wallet.connected
          ? "Connect wallet to continue"
          : status === "preparing"
            ? "Checking transaction…"
            : status === "sending"
              ? "Waiting for wallet…"
              : status === "confirmed"
                  ? "Market confirmed"
                  : "Launch market"}
      </button>
    </section>
  );
}
