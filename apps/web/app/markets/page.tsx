import type { Metadata } from "next";
import { MarketTable } from "@/components/market-table";
import { getMarkets } from "@/lib/data";
export const metadata: Metadata = {
  title: "Markets",
  description: "Explore isolated memecoin lending markets and their exact risk terms.",
};
export default async function MarketsPage() {
  const result = await getMarkets();
  return (
    <main className="shell">
      <header className="page-head">
        <div className="eyebrow">Permissionless markets</div>
        <h1>Know exactly where your USDC goes.</h1>
        <p className="lede">
          Each market has separate assets, immutable parameters, and its own loss boundary.
        </p>
      </header>
      <section className="section">
        {result.state === "ready" ? (
          <MarketTable markets={result.data} />
        ) : (
          <div className="card empty">
            <h3>Market data unavailable</h3>
            <p className="unavailable">{result.reason}</p>
            <p className="muted">No fallback or estimated APY is shown.</p>
          </div>
        )}
      </section>
    </main>
  );
}
