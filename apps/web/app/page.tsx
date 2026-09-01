import Link from "next/link";
import { ArrowRight, CircleDollarSign, HandCoins, ShieldCheck } from "lucide-react";
import { MarketCards } from "@/components/market-cards";
import { getMarkets } from "@/lib/data";
import { homepageSections } from "@/lib/market-discovery";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const result = await getMarkets();
  const sections = result.state === "ready" ? homepageSections(result.data) : null;
  return (
    <main className="shell">
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">Lend Meme Loans</div>
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
        {sections && Object.values(sections).some((markets) => markets.length > 0) ? (
          <div className="discovery-sections">
            {[
              {
                title: "Most liquid",
                note: "Markets with the most USDC supplied.",
                markets: sections.liquid,
              },
              {
                title: "Active borrowing",
                note: "Markets where borrowers are using USDC.",
                markets: sections.active,
              },
              {
                title: "New markets",
                note: "Recently created isolated markets.",
                markets: sections.new,
              },
              {
                title: "Experimental high-rate",
                note: "Unusually expensive borrowing. Review carefully.",
                markets: sections.experimental,
              },
            ]
              .filter((section) => section.markets.length > 0)
              .map((section) => (
                <section key={section.title} className="discovery-section">
                  <div className="compact-heading">
                    <div>
                      <h3>{section.title}</h3>
                      <p>{section.note}</p>
                    </div>
                    <Link href="/markets">View all →</Link>
                  </div>
                  <MarketCards markets={section.markets} />
                </section>
              ))}
          </div>
        ) : result.state === "ready" ? (
          <div className="card empty">
            <h3>No markets indexed yet</h3>
            <p className="muted">New markets usually appear here around 30 seconds after launch.</p>
          </div>
        ) : (
          <div className="card empty">
            <h3>Live markets are temporarily unavailable</h3>
            <p className="muted">No estimated or fallback market data is shown.</p>
          </div>
        )}
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
    </main>
  );
}
