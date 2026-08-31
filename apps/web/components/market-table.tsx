import Link from "next/link";
import type { MarketView } from "@meme-lend/shared";
const money = (raw: string) =>
  `${(Number(raw) / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 0 })} USDC`;
export function MarketTable({ markets }: { markets: MarketView[] }) {
  if (markets.length === 0)
    return (
      <div className="card empty">
        <h3>No markets indexed yet</h3>
        <p className="muted">
          Create the first market or wait for the finalized indexer to catch up.
        </p>
      </div>
    );
  return (
    <div className="card table-wrap">
      <table>
        <thead>
          <tr>
            <th>Market</th>
            <th>Status</th>
            <th>Supply APY</th>
            <th>Borrow APY</th>
            <th>Supplied</th>
            <th>Utilization</th>
            <th>LLTV</th>
            <th>Oracle</th>
          </tr>
        </thead>
        <tbody>
          {markets.map((m) => (
            <tr key={m.address}>
              <td>
                <Link href={`/markets/${m.address}`}>
                  <strong>
                    {m.collateralSymbol ?? `${m.collateralMint.slice(0, 4)}…${m.collateralMint.slice(-4)}`} / USDC
                  </strong>
                  {m.collateralName ? <small>{m.collateralName}</small> : null}
                </Link>
              </td>
              <td>
                <span className={`badge ${m.status === "Unverified" ? "risk" : ""}`}>
                  {m.status}
                </span>
              </td>
              <td>{m.supplyApyBps == null ? "Unavailable" : `${m.supplyApyBps / 100}%`}</td>
              <td>{m.borrowApyBps == null ? "Unavailable" : `${m.borrowApyBps / 100}%`}</td>
              <td>{money(m.suppliedUsdc)}</td>
              <td>{m.utilizationBps / 100}%</td>
              <td>{m.lltvBps / 100}%</td>
              <td>{m.oracleKind}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
