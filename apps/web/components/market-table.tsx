"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { MarketView } from "@meme-lend/shared";
import { formatApr } from "@/lib/rates";
import {
  hasActiveBorrowing,
  liquidityTier,
  sortMarkets,
  type MarketSort,
} from "@/lib/market-discovery";

const money = (raw: string | null | undefined) =>
  `${(Number(raw ?? "0") / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC`;
const identity = (market: MarketView) => {
  const symbol =
    market.collateralSymbol ??
    `${market.collateralMint.slice(0, 4)}…${market.collateralMint.slice(-4)}`;
  return {
    name: market.marketName ?? market.collateralName ?? `${symbol} market`,
    pair: `${symbol} / USDC`,
  };
};

export function MarketTable({ markets }: { markets: MarketView[] }) {
  const [sort, setSort] = useState<MarketSort>("liquidity");
  const [activeOnly, setActiveOnly] = useState(false);
  const visible = useMemo(
    () => sortMarkets(activeOnly ? markets.filter(hasActiveBorrowing) : markets, sort),
    [activeOnly, markets, sort],
  );
  if (markets.length === 0)
    return (
      <div className="card empty">
        <h3>No markets indexed yet</h3>
        <p className="muted">Create the first market or wait around 30 seconds for it to appear.</p>
      </div>
    );
  return (
    <>
      <div className="market-controls">
        <label>
          Sort by{" "}
          <select value={sort} onChange={(event) => setSort(event.target.value as MarketSort)}>
            <option value="liquidity">Highest liquidity</option>
            <option value="lender-apr">Highest lender APR</option>
            <option value="borrowed">Most borrowed</option>
            <option value="borrower-apr">Lowest borrower APR</option>
            <option value="newest">Newest</option>
          </select>
        </label>
        <label className="check-control">
          <input
            type="checkbox"
            checked={activeOnly}
            onChange={(event) => setActiveOnly(event.target.checked)}
          />{" "}
          Active borrowing only
        </label>
      </div>
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Market</th>
              <th>Lender APR</th>
              <th>Borrow APR</th>
              <th>Liquidity</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visible.map((market) => {
              const label = identity(market);
              const tier = liquidityTier(market);
              return (
                <tr key={market.address}>
                  <td>
                    <Link href={`/markets/${market.address}`}>
                      <strong>{label.name}</strong>
                      <small>{label.pair}</small>
                    </Link>
                  </td>
                  <td>
                    <strong>{formatApr(market.supplyAprBps)}</strong>
                    <small>variable estimate</small>
                  </td>
                  <td>
                    <strong>{formatApr(market.borrowAprBps)}</strong>
                    <small>variable rate</small>
                  </td>
                  <td>
                    <strong>{money(market.availableUsdc)} available</strong>
                    <small>
                      {money(market.suppliedUsdc)} supplied · {tier}
                    </small>
                  </td>
                  <td>
                    <Link className="button table-action" href={`/markets/${market.address}`}>
                      View market
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
