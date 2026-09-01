import Link from "next/link";
import type { MarketView } from "@meme-lend/shared";
import { formatApr, formatPeriodEstimate } from "@/lib/rates";
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
            <th>Earn by lending</th>
            <th>Cost to borrow</th>
            <th>Liquidity</th>
            <th>Liquidation limit</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {markets.map((m) => (
            <tr key={m.address}>
              <td>
                <Link href={`/markets/${m.address}`}>
                  <strong>
                    {m.collateralSymbol ??
                      `${m.collateralMint.slice(0, 4)}…${m.collateralMint.slice(-4)}`}{" "}
                    / USDC
                  </strong>
                  {m.collateralName ? <small>{m.collateralName}</small> : null}
                </Link>
              </td>
              <td>
                <strong>{formatApr(m.supplyAprBps)}</strong>
                <small>{formatPeriodEstimate(m.supplyAprBps, 7)} estimated weekly</small>
              </td>
              <td>
                <strong>{formatApr(m.borrowAprBps)}</strong>
                <small>{formatPeriodEstimate(m.borrowAprBps, 30)} estimated over 30 days</small>
              </td>
              <td>
                <strong>{money(m.availableUsdc)} available</strong>
                <small>
                  {money(m.suppliedUsdc)} supplied · {m.utilizationBps / 100}% used
                </small>
              </td>
              <td>
                <strong>{m.lltvBps / 100}% LLTV</strong>
                <small>Borrowers may be liquidated above this level</small>
              </td>
              <td>
                <Link className="button table-action" href={`/markets/${m.address}`}>
                  View
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
