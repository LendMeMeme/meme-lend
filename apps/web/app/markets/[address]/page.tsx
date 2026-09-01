import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getMarket } from "@/lib/data";
import { MarketActions } from "@/components/market-actions";
import { formatApr, formatPeriodEstimate } from "@/lib/rates";
type Props = { params: Promise<{ address: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { address } = await params;
  return {
    title: `Market ${address.slice(0, 6)}…`,
    description:
      "Immutable on-chain market terms, oracle state, liquidity, and transaction history.",
  };
}
export default async function MarketPage({ params }: Props) {
  const { address } = await params;
  const result = await getMarket(address);
  if (result.state === "unavailable")
    return (
      <main className="shell section">
        <div className="card empty">
          <h2>Market data unavailable</h2>
          <p className="unavailable">{result.reason}</p>
        </div>
      </main>
    );
  if (!result.data) notFound();
  const m = result.data;
  const tokenLabel =
    m.collateralSymbol ?? `${m.collateralMint.slice(0, 4)}…${m.collateralMint.slice(-4)}`;
  const usdc = (raw: string) => `${Number(raw) / 1_000_000} USDC`;
  const totalUsdc = (BigInt(m.availableUsdc) + BigInt(m.borrowedUsdc)).toString();
  return (
    <main className="shell">
      <header className="page-head">
        <div className="eyebrow">{m.status} market</div>
        <h1>{tokenLabel} / USDC</h1>
        {m.collateralName ? <p className="muted">{m.collateralName}</p> : null}
        {m.extremeRateRisk ? (
          <div className="risk-banner">
            <strong>Experimental / high-risk rates</strong>
            <span>Maximum borrowing cost is above 100% APR.</span>
          </div>
        ) : null}
        <p className="lede">
          Every value below belongs only to this market. Status is discovery metadata, not a safety
          guarantee.
        </p>
      </header>
      <div className="stat-grid">
        <div className="stat">
          <span>Lenders currently earn</span>
          <strong>
            {formatApr(m.supplyAprBps)} <small>variable estimate</small>
          </strong>
          {m.supplyAprBps === 0 ? <small>No USDC has been borrowed yet.</small> : null}
        </div>
        <div className="stat">
          <span>Borrowers currently pay</span>
          <strong>{formatApr(m.borrowAprBps)}</strong>
        </div>
        <div className="stat">
          <span>Available USDC</span>
          <strong>{usdc(m.availableUsdc)}</strong>
        </div>
        <div className="stat">
          <span>USDC being used</span>
          <strong>
            {usdc(m.borrowedUsdc)} of {usdc(totalUsdc)}
          </strong>
          <small>{m.utilizationBps / 100}% utilization</small>
        </div>
        <div className="stat">
          <span>First-loss reserve</span>
          <strong>{m.firstLossReserve}</strong>
        </div>
      </div>
      <section className="section">
        <div className="section-head">
          <div>
            <div className="eyebrow">Lend or borrow</div>
            <h2>What would you like to do?</h2>
          </div>
          <p className="muted">Each action uses this market only.</p>
        </div>
        <div className="period-summary">
          <span>
            <strong>{formatPeriodEstimate(m.supplyAprBps, 1)}</strong> estimated lender return per
            day
          </span>
          <span>
            <strong>{formatPeriodEstimate(m.supplyAprBps, 7)}</strong> estimated lender return per
            week
          </span>
          <span>
            <strong>{formatPeriodEstimate(m.borrowAprBps, 30)}</strong> estimated borrowing cost
            over 30 days
          </span>
        </div>
        <p className="help">
          Period estimates use simple APR and assume today’s variable rate does not change.
        </p>
        <MarketActions
          market={m.address}
          collateralSymbol={m.collateralSymbol}
          supplyAprBps={m.supplyAprBps}
          borrowAprBps={m.borrowAprBps}
        />
      </section>
      <div className="grid section">
        <section className="card panel span-7">
          <h2>Risk and liquidity</h2>
          <dl>
            <div className="definition">
              <dt>LLTV</dt>
              <dd>{m.lltvBps / 100}% — liquidation threshold</dd>
            </div>
            <div className="definition">
              <dt>Collateral liquidity</dt>
              <dd>{m.collateralLiquidityUsd ?? "Unavailable"}</dd>
            </div>
            <div className="definition">
              <dt>Estimated sell slippage</dt>
              <dd>
                {m.estimatedSellSlippageBps == null
                  ? "Unavailable"
                  : `${m.estimatedSellSlippageBps / 100}%`}
              </dd>
            </div>
            <div className="definition">
              <dt>Bad debt</dt>
              <dd>{m.badDebt}</dd>
            </div>
          </dl>
        </section>
        <aside className="card panel span-5">
          <h2>Immutable identity</h2>
          <dl>
            <div className="definition">
              <dt>Market</dt>
              <dd>{m.address}</dd>
            </div>
            <div className="definition">
              <dt>Collateral mint</dt>
              <dd>{m.collateralMint}</dd>
            </div>
            <div className="definition">
              <dt>Creator</dt>
              <dd>{m.creator}</dd>
            </div>
            {m.rateCurve ? (
              <>
                <div className="definition">
                  <dt>Starting borrow APR</dt>
                  <dd>
                    {Number(
                      (BigInt(m.rateCurve.startBorrowApr) * 10_000n) / 1_000_000_000_000_000_000n,
                    ) / 100}
                    %
                  </dd>
                </div>
                <div className="definition">
                  <dt>Target utilization</dt>
                  <dd>{m.rateCurve.targetUtilizationBps / 100}%</dd>
                </div>
                <div className="definition">
                  <dt>Maximum borrow APR</dt>
                  <dd>
                    {Number(
                      (BigInt(m.rateCurve.maxBorrowApr) * 10_000n) / 1_000_000_000_000_000_000n,
                    ) / 100}
                    %
                  </dd>
                </div>
              </>
            ) : null}
          </dl>
          <h3 style={{ marginTop: 28 }}>Market labels</h3>
          <div className="tag-list" style={{ marginTop: 12 }}>
            {(m.tags ?? []).map((tag) => (
              <span className={`badge tag-${tag.tone}`} title={tag.detail} key={tag.code}>
                {tag.label}
              </span>
            ))}
          </div>
          {(m.tags ?? []).map((tag) => (
            <p className="help" key={`${tag.code}-detail`}>
              <strong>{tag.label}:</strong> {tag.detail}
            </p>
          ))}
        </aside>
        <section className="card panel span-12">
          <h2>On-chain transaction history</h2>
          <p className="muted">
            Confirmed transactions appear when the finalized event index is available.
          </p>
        </section>
      </div>
    </main>
  );
}
