"use client";
import { useState } from "react";
import { useConnection, useWallet } from "@/components/wallet-context";
import type { Transaction } from "@solana/web3.js";
import { buildCreateMarketTransaction, type RATE_MODELS } from "@/lib/transactions";

export function CreateMarketForm() {
  const wallet = useWallet();
  const { connection } = useConnection();
  const [collateralMint, setCollateralMint] = useState("");
  const [lltvBps, setLltvBps] = useState<3000 | 4000 | 5000 | 6000 | 6500>(5000);
  const [rateModel, setRateModel] = useState<keyof typeof RATE_MODELS>("conservative");
  const [marketCap, setMarketCap] = useState("");
  const [walletCap, setWalletCap] = useState("");
  const [prepared, setPrepared] = useState<{ transaction: Transaction; market: string } | null>(
    null,
  );
  const [status, setStatus] = useState<
    "idle" | "simulating" | "reviewed" | "sending" | "confirmed" | "failed"
  >("idle");
  const [message, setMessage] = useState("");
  const [fee, setFee] = useState<number | null>(null);
  const resetReview = () => {
    setPrepared(null);
    setStatus("idle");
    setMessage("");
    setFee(null);
  };
  const review = async () => {
    if (!wallet.publicKey) return;
    setStatus("simulating");
    try {
      const result = await buildCreateMarketTransaction({
        collateralMint,
        lltvBps,
        rateModel,
        marketBorrowCap: marketCap,
        walletBorrowCap: walletCap,
        owner: wallet.publicKey,
        connection,
      });
      const latest = await connection.getLatestBlockhash("confirmed");
      result.transaction.feePayer = wallet.publicKey;
      result.transaction.recentBlockhash = latest.blockhash;
      const simulation = await connection.simulateTransaction(result.transaction);
      if (simulation.value.err)
        throw new Error(`Simulation failed: ${JSON.stringify(simulation.value.err)}`);
      setFee(
        (await connection.getFeeForMessage(result.transaction.compileMessage(), "confirmed")).value,
      );
      setPrepared({ transaction: result.transaction, market: result.market.toBase58() });
      setMessage(`Simulation succeeded. Immutable market address: ${result.market.toBase58()}`);
      setStatus("reviewed");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Market simulation failed");
      setStatus("failed");
    }
  };
  const submit = async () => {
    if (!prepared) return;
    setStatus("sending");
    try {
      const signature = await wallet.sendTransaction(prepared.transaction, connection, {
        preflightCommitment: "confirmed",
      });
      const confirmation = await connection.confirmTransaction(signature, "confirmed");
      if (confirmation.value.err)
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      setMessage(`Market ${prepared.market} confirmed in transaction ${signature}`);
      setStatus("confirmed");
      setPrepared(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Wallet submission failed");
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
          status === "simulating" ||
          status === "sending" ||
          status === "confirmed"
        }
        onClick={status === "reviewed" ? submit : review}
      >
        {!wallet.connected
          ? "Connect wallet to continue"
          : status === "simulating"
            ? "Simulating…"
            : status === "sending"
              ? "Waiting for wallet…"
              : status === "reviewed"
                ? "Create immutable market"
                : status === "confirmed"
                  ? "Market confirmed"
                  : "Review market creation"}
      </button>
    </section>
  );
}
