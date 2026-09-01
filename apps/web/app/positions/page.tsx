import type { Metadata } from "next";
import { PositionsClient } from "@/components/positions-client";
import { getMarkets } from "@/lib/data";

export const metadata: Metadata = {
  title: "Positions",
  description: "View isolated lender and borrower positions directly from Solana.",
};

export default async function PositionsPage() {
  const markets = await getMarkets();
  const addresses = markets.state === "ready" ? markets.data.map((market) => market.address) : [];
  return (
    <main className="shell">
      <header className="page-head">
        <div className="eyebrow">Portfolio</div>
        <h1>My positions.</h1>
        <p className="lede">
          Balances are decoded from market PDAs on Solana; indexed markets are used only for
          discovery.
        </p>
      </header>
      <section className="section">
        <PositionsClient
          markets={addresses}
          unavailableReason={markets.state === "unavailable" ? markets.reason : undefined}
        />
      </section>
    </main>
  );
}
