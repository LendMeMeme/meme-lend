import type { Metadata } from "next";
import { StrategiesClient } from "@/components/strategies-client";

export const metadata: Metadata = {
  title: "Market Strategies",
  description: "Compare example market settings before creating an immutable lending market.",
};

export default function StrategiesPage() {
  return (
    <main className="shell">
      <header className="page-head">
        <div className="eyebrow">Market strategies</div>
        <h1>Choose a sensible starting point.</h1>
        <p className="lede">
          Choose how your market balances affordable borrowing, lender earnings, and protection
          against losses. A strategy is only a starting point—the settings become permanent when the
          market launches.
        </p>
      </header>
      <StrategiesClient />
    </main>
  );
}
