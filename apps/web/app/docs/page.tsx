import type { Metadata } from "next";
export const metadata: Metadata = { title: "Documentation" };
export default function DocsPage() {
  return (
    <main className="shell">
      <header className="page-head">
        <div className="eyebrow">Documentation</div>
        <h1>Simple outside. Explicit inside.</h1>
      </header>
      <article className="prose section">
        <h2>Isolated markets</h2>
        <p>
          Every market has separate vaults, lender shares, borrower debt, oracle rules, fees,
          reserve, and bad debt. A market cannot spend another market’s tokens.
        </p>
        <h2>LLTV</h2>
        <p>
          LLTV is the debt level at which your position can be liquidated. It is immutable after
          market creation.
        </p>
        <h2>Utilization</h2>
        <p>
          Utilization is the percentage of supplied USDC currently borrowed. The variable borrow
          rate rises more sharply above its target.
        </p>
        <h2>Oracle failure</h2>
        <p>
          A stale or invalid oracle blocks borrowing, collateral withdrawal, and liquidation. It
          never blocks repayment or adding collateral.
        </p>
        <h2>First-loss reserve</h2>
        <p>
          USDC deposited into a market reserve absorbs finalized bad debt before regular lenders. It
          reduces risk but does not guarantee repayment.
        </p>
        <h2>Classification</h2>
        <p>
          Every market begins <code>Unverified</code>. Community, Established, Curated, and
          Restricted labels affect discovery only and always include exact reasons.
        </p>
        <h2>Token-2022</h2>
        <p>
          The protocol supports only explicitly allowed extensions. Transfer-fee, transfer-hook,
          permanent-delegate, confidential-transfer, and pausable behavior is rejected in the MVP.
        </p>
      </article>
    </main>
  );
}
