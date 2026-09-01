import type { Metadata } from "next";
import { MarketTable } from "@/components/market-table";
import { getMarkets } from "@/lib/data";
export const metadata: Metadata = {
  title: "Markets",
  description: "Explore isolated memecoin lending markets and their exact risk terms.",
};
export const dynamic = "force-dynamic";
export default async function MarketsPage() {
  const result = await getMarkets();
  return (
    <main className="shell">
      <header className="page-head">
        <div className="eyebrow">Markets</div>
        <h1>Choose where to lend or borrow.</h1>
        <p className="lede">
          Compare real available liquidity, current rates, and the most important risks. Returns are
          variable estimates, never guarantees.
        </p>
      </header>
      <section className="section">
        {result.state === "ready" ? (
          <MarketTable markets={result.data} />
        ) : (
          <div className="card empty">
            <h3>Market data unavailable</h3>
            <p className="unavailable">{result.reason}</p>
            <p className="muted">No fallback or invented APR is shown.</p>
          </div>
        )}
      </section>
    </main>
  );
}
