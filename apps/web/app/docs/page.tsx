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
        <p>
          Lend Meme Loans lets one group supply USDC while another deposits a supported memecoin and
          borrows that USDC. Rates are variable, collateral can lose value, and repayment is never
          guaranteed. Read the market terms before signing.
        </p>
        <h2>For lenders</h2>
        <p>
          Lenders receive shares representing their portion of a market. Borrower interest is split
          among lenders, the creator, and the protocol according to the market’s permanent terms. A
          displayed lender APR is a current estimate—not promised yield. Withdrawals can be delayed
          when most USDC is borrowed, and collateral liquidation may still leave losses.
        </p>
        <h2>For borrowers</h2>
        <p>
          Choose how much USDC you want. The app calculates the collateral needed from the latest
          accepted price and adds a safety buffer. If collateral value falls far enough, anyone may
          repay part of the debt and receive collateral. Repay early or add collateral to reduce
          that risk.
        </p>
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
        <p>
          In plain language: “USDC being used: X of Y.” Higher use commonly raises borrower APR.
          Lender APR is derived from paid borrower interest after immutable fee shares; it is not
          the same number as borrower APR.
        </p>
        <h2>APR and period estimates</h2>
        <p>
          APR is the annual simple rate used by the program. Daily, weekly, and 30-day figures are
          illustrations calculated from that APR and assume the rate stays unchanged. They are not
          compounded APY and are never guaranteed.
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
        <h2>Market creation</h2>
        <p>
          A creator chooses collateral, liquidation limit, borrowing caps, an interest curve, fee
          shares, and optional initial USDC. Core terms are included in the configuration hash and
          cannot be edited afterward. Creating an empty market earns nothing; creator revenue only
          comes from interest actually paid under that market’s fixed split.
        </p>
        <h2>Transaction safety</h2>
        <p>
          The interface prepares and checks a transaction before asking the wallet to sign. Solana
          remains the source of truth. A submitted transaction is not shown as complete until the
          network confirms it. If confirmation is slow, use the transaction signature to check the
          explorer before retrying.
        </p>
        <h2>Indexer and availability</h2>
        <p>
          MongoDB helps discover markets and recover transaction history, but it does not define
          balances or ownership. The index can be rebuilt from Solana. If it is unavailable, the app
          does not invent markets, balances, rates, or success states.
        </p>
        <h2>Bad debt and reserves</h2>
        <p>
          Liquidations use current accepted pricing, a close factor, and the configured incentive.
          If collateral cannot cover debt, finalized bad debt is absorbed by that market’s
          first-loss reserve before regular lender assets. Neither mechanism guarantees recovery.
        </p>
        <h2>Token-2022</h2>
        <p>
          Token-2022 mints are supported with metadata and token-group extensions. Transfer-fee,
          transfer-hook, permanent-delegate, confidential-transfer, and pausable behavior is
          rejected in the MVP.
        </p>
      </article>
    </main>
  );
}
