import { TransactionPanel } from "@/components/transaction-panel";
export default async function LendMarket({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  return (
    <main className="shell">
      <header className="page-head">
        <div className="eyebrow">Market supply</div>
        <h1>Lend USDC.</h1>
      </header>
      <section className="section">
        <TransactionPanel
          action="Supply"
          market={address}
          risk="You accept this market’s collateral, oracle, liquidity, and liquidation risk. Other markets cannot cover its losses."
        />
      </section>
    </main>
  );
}
