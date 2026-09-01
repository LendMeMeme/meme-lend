import Link from "next/link";
import { ArrowRight, Check, CircleDollarSign, Layers3, LockKeyhole, Orbit } from "lucide-react";

export default function HomePage() {
  return (
    <main className="shell">
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="status-dot" /> Live on Solana mainnet
          </div>
          <h1>Liquidity, without shared risk.</h1>
          <p className="lede">
            Lend USDC or borrow against memecoins through fully isolated markets with transparent,
            immutable risk terms.
          </p>
          <div className="actions">
            <Link className="button primary" href="/markets">
              Explore markets <ArrowRight size={17} />
            </Link>
            <Link className="button" href="/create-market">
              Create market
            </Link>
          </div>
          <div className="trust-row" aria-label="Protocol properties">
            <span>
              <Check size={14} /> Isolated markets
            </span>
            <span>
              <Check size={14} /> Immutable parameters
            </span>
            <span>
              <Check size={14} /> On-chain settlement
            </span>
          </div>
        </div>
        <aside className="protocol-card">
          <div className="protocol-card-head">
            <span>Protocol architecture</span>
            <span className="badge">Mainnet</span>
          </div>
          <div className="architecture-row">
            <span className="architecture-icon">
              <CircleDollarSign size={19} />
            </span>
            <div>
              <strong>USDC liquidity</strong>
              <small>Supplied per market</small>
            </div>
          </div>
          <div className="architecture-line" />
          <div className="architecture-row">
            <span className="architecture-icon">
              <Layers3 size={19} />
            </span>
            <div>
              <strong>Isolated collateral</strong>
              <small>No cross-market contagion</small>
            </div>
          </div>
          <div className="architecture-line" />
          <div className="architecture-row">
            <span className="architecture-icon">
              <LockKeyhole size={19} />
            </span>
            <div>
              <strong>Fixed risk terms</strong>
              <small>Immutable after creation</small>
            </div>
          </div>
          <div className="program-strip">
            <span>Program</span>
            <code>8hDE…uJym</code>
          </div>
        </aside>
      </section>
      <section className="section">
        <div className="section-head">
          <div>
            <div className="eyebrow">Live markets</div>
            <h2>Choose risk on your terms.</h2>
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
              Choose an approved oracle, LLTV preset, rate model, caps, and initial USDC liquidity.
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
