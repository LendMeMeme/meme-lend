import { TransactionPanel } from "@/components/transaction-panel";
export default function LendPage() {
  return (
    <main className="shell">
      <header className="page-head">
        <div className="eyebrow">Lend USDC</div>
        <h1>Pick one market’s risk.</h1>
        <p className="lede">Your supply shares participate only in the market you choose.</p>
      </header>
      <section className="section">
        <TransactionPanel
          action="Supply"
          risk="Lenders can lose principal if collateral cannot be liquidated and the market reserve is insufficient."
        />
      </section>
    </main>
  );
}
