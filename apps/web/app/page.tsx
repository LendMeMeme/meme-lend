import Link from "next/link";
import { ArrowRight, Orbit, ShieldAlert, Waves } from "lucide-react";

export default function HomePage() {
  return (
    <main className="shell">
      <section className="hero">
        <div>
          <div className="eyebrow">Isolated lending on Solana</div>
          <h1>Put your memecoin to work.</h1>
          <p className="lede">
            Lend USDC or borrow against memecoins in isolated markets with clear, immutable risk
            terms.
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
        <aside className="risk-note">
          <strong>Take a moment to check the risk.</strong>
          <br />
          Anyone can create a market. Review its oracle, liquidity, borrowing limit, and reserve
          before supplying.
        </aside>
      </section>
      <section className="section">
        <div className="section-head">
          <div>
            <div className="eyebrow">Live markets</div>
            <h2>Choose the risk yourself.</h2>
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
        <div className="card assurance-card">
          <ShieldAlert color="var(--yellow)" />
          <div>
            <strong>First-loss reserves reduce risk; they do not guarantee repayment.</strong>
            <div className="muted assurance-copy">
              Price gaps, oracle failures, and missing liquidation demand can still create lender
              losses.
            </div>
          </div>
          <Waves style={{ marginLeft: "auto" }} color="var(--green)" />
        </div>
      </section>
    </main>
  );
}
