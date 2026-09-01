"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { borrowAprAtUtilization, lenderAprAtUtilization, RATE_SCALE } from "@meme-lend/sdk";
import { recommendStrategy, strategies, strategyHref } from "@/lib/strategies";

const points = [0, 25, 50, 90, 100] as const;
const percent = (value: bigint) => `${Number((value * 10_000n) / RATE_SCALE) / 100}%`;
const shape = ["", "Linear", "Quadratic", "Cubic"];

export function StrategiesClient() {
  const [priority, setPriority] = useState<"borrowers" | "both" | "lenders">("both");
  const [risk, setRisk] = useState<"lower" | "volatile" | "very-high">("volatile");
  const [liquidity, setLiquidity] = useState("10000");
  const recommendation = useMemo(
    () =>
      recommendStrategy({
        priority,
        collateralRisk: risk,
        initialLiquidity: Number(liquidity) || 0,
      }),
    [priority, risk, liquidity],
  );
  return (
    <>
      <section className="strategy-chooser card panel" aria-labelledby="strategy-chooser-title">
        <div>
          <span className="eyebrow">Quick chooser</span>
          <h2 id="strategy-chooser-title">Find a starting point</h2>
        </div>
        <label>
          Who do you want to prioritize?
          <select value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}>
            <option value="borrowers">Borrowers</option>
            <option value="both">Both sides</option>
            <option value="lenders">Lenders</option>
          </select>
        </label>
        <label>
          How risky is the collateral?
          <select value={risk} onChange={(e) => setRisk(e.target.value as typeof risk)}>
            <option value="lower">Lower risk</option>
            <option value="volatile">Volatile</option>
            <option value="very-high">Very volatile or low liquidity</option>
          </select>
        </label>
        <label>
          How much initial USDC?
          <input
            inputMode="decimal"
            value={liquidity}
            onChange={(e) => setLiquidity(e.target.value)}
          />
        </label>
        <div className="strategy-result">
          <span>Suggested starting point</span>
          <strong>{strategies.find((item) => item.id === recommendation)?.title}</strong>
          <small>Interface suggestion only—not financial advice or a safety guarantee.</small>
        </div>
      </section>

      <section className="strategy-grid" aria-label="Market strategy examples">
        {strategies.map((strategy) => {
          const utilizationPoints = [
            ...new Set([...points, strategy.curve.targetUtilizationBps / 100]),
          ].sort((a, b) => a - b);
          return (
            <article
              className={`card strategy-card ${strategy.id === recommendation ? "recommended" : ""}`}
              key={strategy.id}
            >
              <div className="strategy-card-head">
                <div>
                  <span className="eyebrow">
                    {strategy.id === recommendation
                      ? "Suggested for your answers"
                      : "Strategy example"}
                  </span>
                  <h2>{strategy.title}</h2>
                </div>
                <span className={`risk-meter risk-${strategy.riskLevel.toLowerCase()}`}>
                  {strategy.riskLevel} risk
                </span>
              </div>
              <p>
                <strong>Best for:</strong> {strategy.bestFor}
              </p>
              <div className="strategy-audience">
                <div>
                  <span>For borrowers</span>
                  <p>{strategy.borrowerBenefit}</p>
                </div>
                <div>
                  <span>For lenders</span>
                  <p>{strategy.lenderBenefit}</p>
                </div>
              </div>
              <div className="strategy-warning">
                <strong>Main risk</strong>
                <span>{strategy.risk}</span>
              </div>
              <div className="strategy-headlines">
                <div>
                  <span>Liquidation limit</span>
                  <strong>{strategy.lltvBps / 100}%</strong>
                </div>
                <div>
                  <span>Starting APR</span>
                  <strong>{percent(strategy.curve.startBorrowApr)}</strong>
                </div>
                <div>
                  <span>Target use</span>
                  <strong>{strategy.curve.targetUtilizationBps / 100}%</strong>
                </div>
              </div>
              <div className="curve-chart" aria-label={`${strategy.title} borrowing-rate examples`}>
                {utilizationPoints.map((use) => {
                  const utilization = (RATE_SCALE * BigInt(use)) / 100n;
                  const borrower = borrowAprAtUtilization(strategy.curve, utilization);
                  const lender = lenderAprAtUtilization(strategy.curve, utilization, 1000, 500);
                  const width = Number((borrower * 100n) / strategy.curve.maxBorrowApr);
                  return (
                    <div className="curve-row" key={use}>
                      <span>{use}% used</span>
                      <div>
                        <i style={{ width: `${Math.max(2, width)}%` }} />
                      </div>
                      <strong>{percent(borrower)}</strong>
                      <small>Lenders: {percent(lender)} est.</small>
                    </div>
                  );
                })}
              </div>
              <div className="utilization-key">
                <span>More USDC available</span>
                <span>Healthy borrowing</span>
                <span>Getting full</span>
                <span>Almost all borrowed</span>
              </div>
              <details>
                <summary>View advanced settings</summary>
                <dl>
                  <div>
                    <dt>Starting borrow APR</dt>
                    <dd>{percent(strategy.curve.startBorrowApr)} when almost no USDC is used</dd>
                  </div>
                  <div>
                    <dt>Target utilization</dt>
                    <dd>
                      {strategy.curve.targetUtilizationBps / 100}% — when the pool becomes busy
                    </dd>
                  </div>
                  <div>
                    <dt>APR at target</dt>
                    <dd>{percent(strategy.curve.targetBorrowApr)}</dd>
                  </div>
                  <div>
                    <dt>Maximum APR</dt>
                    <dd>{percent(strategy.curve.maxBorrowApr)}</dd>
                  </div>
                  <div>
                    <dt>Curve</dt>
                    <dd>
                      {shape[strategy.curve.aboveTargetShape]} — controls the rise above target
                    </dd>
                  </div>
                  <div>
                    <dt>Wallet cap suggestion</dt>
                    <dd>{strategy.walletCap}</dd>
                  </div>
                  <div>
                    <dt>First-loss reserve</dt>
                    <dd>{strategy.reserve}</dd>
                  </div>
                </dl>
              </details>
              <p className="help">
                Lender APR examples use the exact SDK formula and standard 10% creator + 5% protocol
                fee split. Returns are variable and not guaranteed.
              </p>
              <Link className="button primary" href={strategyHref(strategy.id)}>
                Use this strategy
              </Link>
            </article>
          );
        })}
      </section>
      <section className="section">
        <div className="section-head">
          <div>
            <span className="eyebrow">Compare</span>
            <h2>Strategies at a glance</h2>
          </div>
        </div>
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Strategy</th>
                <th>Borrower cost</th>
                <th>Lender potential</th>
                <th>Collateral protection</th>
                <th>Liquidity protection</th>
                <th>Best use</th>
                <th>Risk</th>
              </tr>
            </thead>
            <tbody>
              {strategies.map((s) => (
                <tr key={`${s.id}-comparison`}>
                  <td>
                    <strong>{s.title}</strong>
                  </td>
                  <td>
                    {percent(s.curve.startBorrowApr)} to {percent(s.curve.maxBorrowApr)}
                  </td>
                  <td>
                    {s.id === "borrower-friendly"
                      ? "Lower"
                      : s.id === "protect-lenders"
                        ? "Higher, variable"
                        : "Moderate, variable"}
                  </td>
                  <td>{s.lltvBps <= 4000 ? "Stronger" : "Standard"}</td>
                  <td>{s.curve.targetUtilizationBps <= 7000 ? "Stronger" : "Standard"}</td>
                  <td>{s.bestFor}</td>
                  <td>{s.riskLevel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
