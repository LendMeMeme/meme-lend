import type { Metadata } from "next";
import { CreateMarketForm } from "@/components/create-market-form";
export const metadata: Metadata = { title: "Create Market" };
export default function CreateMarketPage() {
  return (
    <main className="shell">
      <header className="page-head">
        <div className="eyebrow">New isolated market</div>
        <h1>Set the terms once.</h1>
        <p className="lede">
          Core risk parameters become immutable. Different terms require a separate market.
        </p>
      </header>
      <div className="grid section">
        <CreateMarketForm />
        <aside className="span-5">
          <div className="card panel warning">
            Creating a market does not verify or endorse its collateral. The oracle, LLTV, caps,
            fees, and rate curve cannot be edited afterward.
          </div>
          <div className="card panel" style={{ marginTop: 16 }}>
            <h3>Optional protection</h3>
            <p className="muted">
              Seed USDC liquidity, add memecoin lender rewards, and deposit a first-loss reserve
              after market creation.
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}
