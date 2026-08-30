import { TransactionPanel } from "@/components/transaction-panel";
export default function BorrowPage() {
  return (
    <main className="shell">
      <header className="page-head">
        <div className="eyebrow">Borrow USDC</div>
        <h1>Collateralize a meme.</h1>
        <p className="lede">
          Borrowing requires a fresh approved oracle and a conservative recoverable-liquidity limit.
        </p>
      </header>
      <section className="section">
        <TransactionPanel
          action="Borrow"
          risk="A price decline can trigger permissionless liquidation. Oracle failure blocks new borrowing and collateral withdrawal."
        />
      </section>
    </main>
  );
}
