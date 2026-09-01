import Link from "next/link";
import type { MarketView } from "@meme-lend/shared";
import { formatApr, formatPeriodEstimate } from "@/lib/rates";
import { borrowingInactiveReason } from "@/lib/market-discovery";

const money = (raw: string | null | undefined) =>
  `${(Number(raw ?? "0") / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC`;

export function MarketCards({ markets }: { markets: MarketView[] }) {
  return (
    <div className="market-card-grid">
      {markets.map((market) => {
        const symbol =
          market.collateralSymbol ??
          `${market.collateralMint.slice(0, 4)}…${market.collateralMint.slice(-4)}`;
        const inactiveReason = borrowingInactiveReason(market);
        return (
          <article
            className={`card market-card${inactiveReason ? " market-inactive" : ""}`}
            key={market.address}
          >
            <div>
              <h3>{market.marketName ?? market.collateralName ?? `${symbol} market`}</h3>
              <p>{symbol} / USDC</p>
              {inactiveReason ? (
                <span className="badge tag-critical">Inactive for borrowing</span>
              ) : null}
            </div>
            <dl>
              <div>
                <dt>Lenders earn</dt>
                <dd>
                  {formatApr(market.supplyAprBps)}
                  {market.supplyAprBps == null ? null : (
                    <small>{formatPeriodEstimate(market.supplyAprBps, 1)} per day</small>
                  )}
                </dd>
              </div>
              <div>
                <dt>Borrowers pay</dt>
                <dd>
                  {formatApr(market.borrowAprBps)}
                  {market.borrowAprBps == null ? null : (
                    <small>{formatPeriodEstimate(market.borrowAprBps, 1)} per day</small>
                  )}
                </dd>
              </div>
              <div>
                <dt>Available</dt>
                <dd>{money(market.availableUsdc)}</dd>
              </div>
            </dl>
            <Link className="button" href={`/markets/${market.address}`}>
              {inactiveReason ? "View reason" : "View market"}
            </Link>
          </article>
        );
      })}
    </div>
  );
}
