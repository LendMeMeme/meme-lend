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
            USDC is the fixed loan asset; the mint entered here is the memecoin collateral. Creating
            a market does not verify or endorse that collateral. The oracle publisher, LLTV, caps,
            fees, and rate curve cannot be edited afterward.
          </div>
          <div className="card panel" style={{ marginTop: 16 }}>
            <h3>After creation</h3>
            <p className="muted">
              The oracle publisher must submit the first signed price observation before borrowing
              can begin. You can then seed USDC liquidity, add memecoin lender rewards, and deposit
              a first-loss USDC reserve.
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}
