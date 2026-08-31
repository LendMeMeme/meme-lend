"use client";
import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@/components/wallet-context";
import {
  decodePinocchioBorrowerPosition,
  decodePinocchioLenderPosition,
  PINOCCHIO_PROGRAM_ID,
  pinocchioPdas,
} from "@meme-lend/sdk";
import { PublicKey, type AccountInfo } from "@solana/web3.js";
import { WalletControl } from "@/components/wallet-control";

interface PositionRow {
  market: string;
  supplyShares: string;
  collateralAmount: string;
  borrowShares: string;
}
export function PositionsClient({
  markets,
  unavailableReason,
}: {
  markets: string[];
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
        const keys = markets.flatMap((text) => {
          const market = new PublicKey(text);
          return [
            pinocchioPdas.lenderPosition(market, publicKey, programId)[0],
            pinocchioPdas.borrowerPosition(market, publicKey, programId)[0],
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
          const lenderInfo = infos[index * 2],
            borrowerInfo = infos[index * 2 + 1];
          const lender = lenderInfo ? decodePinocchioLenderPosition(lenderInfo.data) : null;
          const borrower = borrowerInfo ? decodePinocchioBorrowerPosition(borrowerInfo.data) : null;
          if (
            (!lender || lender.supplyShares === 0n) &&
            (!borrower || (borrower.collateralAmount === 0n && borrower.borrowShares === 0n))
          )
            return [];
          return [
            {
              market,
              supplyShares: lender?.supplyShares.toString() ?? "0",
              collateralAmount: borrower?.collateralAmount.toString() ?? "0",
              borrowShares: borrower?.borrowShares.toString() ?? "0",
            },
          ];
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
          No non-zero lender or borrower PDAs exist across {markets.length} indexed markets for{" "}
          {publicKey.toBase58()}.
        </p>
      </div>
    );
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Market</th>
            <th>Supply shares</th>
            <th>Collateral units</th>
            <th>Borrow shares</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.market}>
              <td className="mono">{row.market}</td>
              <td>{row.supplyShares}</td>
              <td>{row.collateralAmount}</td>
              <td>{row.borrowShares}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
