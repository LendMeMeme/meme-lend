import { TransactionPanel } from "@/components/transaction-panel";
export default function LiquidationsPage() {
  return (
    <main className="shell">
      <header className="page-head">
        <div className="eyebrow">Permissionless liquidations</div>
        <h1>Repay debt. Receive collateral.</h1>
        <p className="lede">Only positions above their immutable liquidation LTV are eligible.</p>
      </header>
      <div className="grid section">
        <section className="card empty span-7">
          <h3>Verify the target on-chain</h3>
          <p className="muted">
            Enter the isolated market and borrower wallet. Simulation reads current debt,
            collateral, and oracle accounts and fails if the position is healthy or the oracle is
            unavailable.
          </p>
        </section>
        <aside className="span-5">
          <TransactionPanel
            action="Liquidate"
            risk="Seizure is capped by close factor, configured incentive, and remaining borrower collateral."
          />
        </aside>
      </div>
    </main>
  );
}
