"use client";
import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@/components/wallet-context";
import {
  decodePinocchioBorrowerPosition,
  decodePinocchioLenderPosition,
  decodePinocchioMarket,
  associatedTokenAddress,
  PINOCCHIO_PROGRAM_ID,
  pinocchioPdas,
} from "@meme-lend/sdk";
import { PublicKey, type AccountInfo } from "@solana/web3.js";
import { WalletControl } from "@/components/wallet-control";
import type { MarketView } from "@meme-lend/shared";

interface PositionRow {
  market: string;
  label: string;
  supplied: string;
  collateral: string;
  borrowed: string;
}

const formatUnits = (value: bigint, decimals: number) => {
  const base = 10n ** BigInt(decimals),
    whole = value / base,
    fraction = (value % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction.slice(0, 6)}` : whole.toString();
};

const divideUp = (numerator: bigint, denominator: bigint) =>
  numerator === 0n ? 0n : (numerator + denominator - 1n) / denominator;
export function PositionsClient({
  markets,
  unavailableReason,
}: {
  markets: MarketView[];
  unavailableReason?: string;
}) {
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const [rows, setRows] = useState<PositionRow[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "failed">("idle");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!publicKey) {
      setRows([]);
      setState("idle");
      return;
    }
    let cancelled = false;
    setState("loading");
    void (async () => {
      try {
        const programId = new PublicKey(process.env.NEXT_PUBLIC_PROGRAM_ID ?? PINOCCHIO_PROGRAM_ID);
        const marketKeys = markets.map((market) => new PublicKey(market.address));
        const marketInfos = await connection.getMultipleAccountsInfo(marketKeys, "confirmed");
        const decoded = marketInfos.map((info) => (info ? decodePinocchioMarket(info.data) : null));
        const keys = marketKeys.flatMap((market, index) => {
          const state = decoded[index];
          if (!state) return [];
          const [authority] = pinocchioPdas.marketAuthority(market, programId);
          return [
            pinocchioPdas.lenderPosition(market, publicKey, programId)[0],
            pinocchioPdas.borrowerPosition(market, publicKey, programId)[0],
            associatedTokenAddress(state.loanMint, authority),
            state.collateralMint,
          ];
        });
        const infos: Array<AccountInfo<Buffer> | null> = [];
        for (let offset = 0; offset < keys.length; offset += 100)
          infos.push(
            ...(await connection.getMultipleAccountsInfo(
              keys.slice(offset, offset + 100),
              "confirmed",
            )),
          );
        const next = markets.flatMap((market, index) => {
          const state = decoded[index];
          if (!state) return [];
          const lenderInfo = infos[index * 4],
            borrowerInfo = infos[index * 4 + 1],
            vaultInfo = infos[index * 4 + 2],
            collateralMintInfo = infos[index * 4 + 3];
          const lender = lenderInfo ? decodePinocchioLenderPosition(lenderInfo.data) : null;
          const borrower = borrowerInfo ? decodePinocchioBorrowerPosition(borrowerInfo.data) : null;
          if (
            (!lender || lender.supplyShares === 0n) &&
            (!borrower || (borrower.collateralAmount === 0n && borrower.borrowShares === 0n))
          )
            return [];
          const cash = vaultInfo ? vaultInfo.data.readBigUInt64LE(64) : 0n;
          const grossAssets = cash + state.totalDebt;
          const fees = state.creatorFeesClaimable + state.protocolFeesClaimable;
          const assets = grossAssets > fees ? grossAssets - fees : 0n;
          const supplyShares = lender?.supplyShares ?? 0n;
          const supplied =
            (supplyShares * (assets + 1_000_000n)) / (state.totalSupplyShares + 1_000_000n);
          const borrowShares = borrower?.borrowShares ?? 0n;
          const borrowed = divideUp(
            borrowShares * state.borrowIndex,
            1_000_000_000_000_000_000n,
          );
          const collateralDecimals = collateralMintInfo?.data[44] ?? 0;
          const symbol = market.collateralSymbol ?? "memecoin";
          return [{
            market: market.address,
            label: `${symbol} / USDC`,
            supplied: `${formatUnits(supplied, 6)} USDC`,
            collateral: `${formatUnits(borrower?.collateralAmount ?? 0n, collateralDecimals)} ${symbol}`,
            borrowed: `${formatUnits(borrowed, 6)} USDC`,
          }];
        });
        if (!cancelled) {
          setRows(next);
          setState("ready");
        }
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Position lookup failed");
          setState("failed");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connection, markets, publicKey]);
  if (!publicKey)
    return (
      <div className="card empty">
        <h3>Connect a wallet</h3>
        <p className="muted">Your isolated lender and borrower positions will appear here.</p>
        <WalletControl />
      </div>
    );
  if (unavailableReason)
    return (
      <div className="card empty">
        <h3>Market discovery unavailable</h3>
        <p className="unavailable">{unavailableReason}</p>
        <p className="muted">
          No claim about wallet positions can be made until the recoverable index is reachable.
        </p>
      </div>
    );
  if (state === "loading")
    return (
      <div className="card empty">
        <h3>Reading Solana accounts…</h3>
      </div>
    );
  if (state === "failed")
    return (
      <div className="card empty">
        <h3>Position lookup unavailable</h3>
        <p className="unavailable">{error}</p>
      </div>
    );
  if (rows.length === 0)
    return (
      <div className="card empty">
        <h3>No live positions found</h3>
        <p className="muted">
          You have not lent or borrowed in any of the {markets.length} available markets yet.
        </p>
      </div>
    );
  return (
    <div className="position-grid">
      {rows.map((row) => (
        <article className="card position-card" key={row.market}>
          <div>
            <span className="eyebrow">Your {row.label} market</span>
            <h2>{row.label}</h2>
          </div>
          <div className="position-facts">
            <div><span>You lent</span><strong>{row.supplied}</strong></div>
            <div><span>Your safety deposit</span><strong>{row.collateral}</strong></div>
            <div><span>You borrowed</span><strong>{row.borrowed}</strong></div>
          </div>
          <a className="button secondary" href={`/markets/${row.market}`}>Open this market</a>
        </article>
      ))}
    </div>
  );
}
