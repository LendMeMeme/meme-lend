import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getMarket } from "@/lib/data";
import { MarketActions } from "@/components/market-actions";
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
  return (
    <main className="shell">
      <header className="page-head">
        <div className="eyebrow">{m.status} market</div>
        <h1>{tokenLabel} / USDC</h1>
        {m.collateralName ? <p className="muted">{m.collateralName}</p> : null}
        <p className="lede">
          Every value below belongs only to this market. Status is discovery metadata, not a safety
          guarantee.
        </p>
      </header>
      <div className="stat-grid">
        <div className="stat">
          <span>Supply APY</span>
          <strong>{m.supplyApyBps == null ? "Unavailable" : `${m.supplyApyBps / 100}%`}</strong>
        </div>
        <div className="stat">
          <span>Borrow APY</span>
          <strong>{m.borrowApyBps == null ? "Unavailable" : `${m.borrowApyBps / 100}%`}</strong>
        </div>
        <div className="stat">
          <span>Available USDC</span>
          <strong>{usdc(m.availableUsdc)}</strong>
        </div>
        <div className="stat">
          <span>Utilization</span>
          <strong>{m.utilizationBps / 100}%</strong>
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
        <MarketActions market={m.address} collateralSymbol={m.collateralSymbol} />
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
              <dt>Oracle</dt>
              <dd>
                {m.oracleKind}
                {m.customOracleHighRisk ? " — custom, high risk" : ""}
              </dd>
            </div>
            <div className="definition">
              <dt>Oracle freshness</dt>
              <dd>{m.oraclePublishedAt ?? "Unavailable"}</dd>
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
          </dl>
          <h3 style={{ marginTop: 28 }}>Classification reasons</h3>
          {m.statusReasons.map((r) => (
            <p className="help" key={r.code}>
              <strong>{r.label}:</strong> {r.detail}
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
