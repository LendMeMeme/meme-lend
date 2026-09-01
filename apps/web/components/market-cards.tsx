import Link from "next/link";
import type { MarketView } from "@meme-lend/shared";
import { formatApr } from "@/lib/rates";

const money = (raw: string | null | undefined) =>
  `${(Number(raw ?? "0") / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC`;

export function MarketCards({ markets }: { markets: MarketView[] }) {
  return (
    <div className="market-card-grid">
      {markets.map((market) => {
        const symbol =
          market.collateralSymbol ??
          `${market.collateralMint.slice(0, 4)}…${market.collateralMint.slice(-4)}`;
        return (
          <article className="card market-card" key={market.address}>
            <div>
              <h3>{market.marketName ?? market.collateralName ?? `${symbol} market`}</h3>
              <p>{symbol} / USDC</p>
            </div>
            <dl>
              <div>
                <dt>Lenders earn</dt>
                <dd>
                  {formatApr(market.supplyAprBps)} <small>variable</small>
                </dd>
              </div>
              <div>
                <dt>Available</dt>
                <dd>{money(market.availableUsdc)}</dd>
              </div>
            </dl>
            <Link className="button" href={`/markets/${market.address}`}>
              View market
            </Link>
          </article>
        );
      })}
    </div>
  );
}
