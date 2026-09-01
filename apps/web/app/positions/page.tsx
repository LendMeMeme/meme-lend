import type { Metadata } from "next";
import { PositionsClient } from "@/components/positions-client";
import { getMarkets } from "@/lib/data";

export const metadata: Metadata = {
  title: "Positions",
  description: "View isolated lender and borrower positions directly from Solana.",
};

export default async function PositionsPage() {
  const markets = await getMarkets();
  const discoveredMarkets = markets.state === "ready" ? markets.data : [];
  return (
    <main className="shell">
      <header className="page-head">
        <div className="eyebrow">Portfolio</div>
        <h1>My money.</h1>
        <p className="lede">
          See what you lent, what you borrowed, and the collateral keeping your loan safe.
        </p>
      </header>
      <section className="section">
        <PositionsClient
          markets={discoveredMarkets}
          unavailableReason={markets.state === "unavailable" ? markets.reason : undefined}
        />
      </section>
    </main>
  );
}
