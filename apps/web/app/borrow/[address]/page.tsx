import { TransactionPanel } from "@/components/transaction-panel";
export default async function BorrowMarket({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  return (
    <main className="shell">
      <header className="page-head">
        <div className="eyebrow">Market borrow</div>
        <h1>Borrow USDC.</h1>
      </header>
      <div className="grid section">
        <div className="span-5">
          <TransactionPanel
            action="Deposit collateral"
            market={address}
            risk="Adding collateral is always allowed, even when the oracle is unavailable or borrowing is paused."
          />
        </div>
        <div className="span-7">
          <TransactionPanel
            action="Borrow"
            market={address}
            risk="The transaction is blocked unless its simulated resulting health passes every on-chain limit."
          />
        </div>
      </div>
    </main>
  );
}
