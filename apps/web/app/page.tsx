import Link from "next/link";
import { ArrowRight, CircleDollarSign, HandCoins, ShieldCheck, Orbit } from "lucide-react";

export default function HomePage() {
  return (
    <main className="shell">
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">Lend Meme Loans</div>
          <h1>Make your USDC useful.</h1>
          <p className="lede">
            Earn interest by lending USDC, or use your memecoin to borrow USDC without selling it.
            Every market shows its costs and risks before you act.
          </p>
          <div className="actions">
            <Link className="button primary" href="/markets">
              Explore markets <ArrowRight size={17} />
            </Link>
            <Link className="button" href="/create-market">
              Create market
            </Link>
          </div>
        </div>
        <aside className="protocol-card">
          <div className="protocol-card-head">
            <span>Choose what you want to do</span>
          </div>
          <div className="architecture-row">
            <span className="architecture-icon">
              <CircleDollarSign size={19} />
            </span>
            <div>
              <strong>Earn with USDC</strong>
              <small>Borrowers pay variable interest to lenders.</small>
            </div>
          </div>
          <div className="architecture-line" />
          <div className="architecture-row">
            <span className="architecture-icon">
              <HandCoins size={19} />
            </span>
            <div>
              <strong>Borrow USDC</strong>
              <small>Deposit a supported memecoin as security.</small>
            </div>
          </div>
          <div className="architecture-line" />
          <div className="architecture-row">
            <span className="architecture-icon">
              <ShieldCheck size={19} />
            </span>
            <div>
              <strong>Understand the risk</strong>
              <small>Rates, liquidity, and liquidation limits stay visible.</small>
            </div>
          </div>
        </aside>
      </section>
      <section className="section">
        <div className="section-head">
          <div>
            <div className="eyebrow">Live markets</div>
            <h2>Compare before you choose.</h2>
          </div>
          <Link className="muted" href="/markets">
            View all markets →
          </Link>
        </div>
        <div className="card empty">
          <div className="empty-icon">
            <Orbit size={23} />
          </div>
          <h3>No indexed markets available</h3>
          <p className="muted">
            Markets will appear after the indexer connects and observes confirmed on-chain creation
            events.
          </p>
        </div>
        <div className="steps">
          <article className="card step">
            <span className="step-number">01 / CREATE</span>
            <h3>Pick the exact terms</h3>
            <p>
              Choose the managed oracle, LLTV, immutable APR curve, caps, and initial USDC
              liquidity.
            </p>
          </article>
          <article className="card step">
            <span className="step-number">02 / LEND</span>
            <h3>Fund one market</h3>
            <p>
              Lenders choose individual pools. A failed memecoin cannot reach another market’s
              assets.
            </p>
          </article>
          <article className="card step">
            <span className="step-number">03 / BORROW</span>
            <h3>Borrow within real liquidity</h3>
            <p>
              Limits use oracle value, cash, caps, and a conservative recoverable-liquidity ceiling.
            </p>
          </article>
        </div>
      </section>
      <section className="section">
        <div className="risk-note">
          <div className="risk-label">Risk notice</div>
          <div>
            <strong>Every market has its own risk profile.</strong>
            <p>
              Review the oracle, liquidity, borrowing limit, and first-loss reserve before
              supplying. Reserves reduce risk; they do not guarantee repayment.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
