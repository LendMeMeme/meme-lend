"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useConnection, useWallet } from "@/components/wallet-context";
import type { Connection } from "@solana/web3.js";
import { buildCreateMarketTransaction, RATE_MODELS } from "@/lib/transactions";
import { confirmSignatureByPolling } from "@/lib/confirmation";
import {
  borrowAprAtUtilization,
  lenderAprAtUtilization,
  projectSimpleAprDebt,
  RATE_SCALE,
  type ImmutableRateCurve,
  type RateShape,
  validateRateCurve,
} from "@meme-lend/sdk";
import { strategyById } from "@/lib/strategies";

type RateChoice = keyof typeof RATE_MODELS | "advanced";
const utilizationPoints = [0, 25, 50, 75, 90, 100] as const;
const percentToApr = (value: string) => {
  if (!/^\d+(\.\d{0,6})?$/.test(value))
    throw new Error("APR must be a positive percentage with up to 6 decimals");
  const [whole, fraction = ""] = value.split(".");
  return (
    ((BigInt(whole) * 1_000_000n + BigInt((fraction + "000000").slice(0, 6))) * RATE_SCALE) /
    100_000_000n
  );
};
const aprLabel = (apr: bigint) => {
  const scaled = (apr * 100_000n) / RATE_SCALE;
  const whole = scaled / 1_000n;
  const fraction = (scaled % 1_000n).toString().padStart(3, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}%` : `${whole}%`;
};
const aprInput = (apr: bigint) => {
  const scaled = (apr * 100_000_000n) / RATE_SCALE;
  const whole = scaled / 1_000_000n;
  const fraction = (scaled % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
};

async function errorMessage(error: unknown, connection: Connection) {
  let logs: string[] | null = null;
  if (
    typeof error === "object" &&
    error !== null &&
    "getLogs" in error &&
    typeof error.getLogs === "function"
  ) {
    try {
      logs = await (error.getLogs as (connection: Connection) => Promise<string[]>)(connection);
    } catch {
      // Preserve the original wallet/RPC error when log retrieval is unavailable.
    }
  }
  const message = error instanceof Error ? error.message : "Market launch failed";
  return logs?.length ? `${message}\n${logs.slice(-8).join("\n")}` : message;
}

export function CreateMarketForm({ initialStrategy }: { initialStrategy?: string }) {
  const selectedStrategy = strategyById(initialStrategy);
  const router = useRouter();
  const wallet = useWallet();
  const { connection } = useConnection();
  const [marketName, setMarketName] = useState("");
  const [collateralMint, setCollateralMint] = useState("");
  const [setupMode, setSetupMode] = useState<"basic" | "advanced">(
    selectedStrategy ? "advanced" : "basic",
  );
  const [lltvBps, setLltvBps] = useState<3000 | 4000 | 5000 | 6000 | 6500>(
    selectedStrategy?.lltvBps ?? 5000,
  );
  const [rateChoice, setRateChoice] = useState<RateChoice>(
    selectedStrategy ? "advanced" : "balanced",
  );
  const [startApr, setStartApr] = useState(
    selectedStrategy ? aprInput(selectedStrategy.curve.startBorrowApr) : "2",
  );
  const [targetUtilization, setTargetUtilization] = useState(
    selectedStrategy ? String(selectedStrategy.curve.targetUtilizationBps / 100) : "80",
  );
  const [targetApr, setTargetApr] = useState(
    selectedStrategy ? aprInput(selectedStrategy.curve.targetBorrowApr) : "20",
  );
  const [maximumApr, setMaximumApr] = useState(
    selectedStrategy ? aprInput(selectedStrategy.curve.maxBorrowApr) : "220",
  );
  const [rateShape, setRateShape] = useState<RateShape>(
    selectedStrategy?.curve.aboveTargetShape ?? 2,
  );
  const [extremeAcknowledged, setExtremeAcknowledged] = useState(false);
  const [marketCap, setMarketCap] = useState("");
  const [walletCap, setWalletCap] = useState("");
  const [initialLiquidity, setInitialLiquidity] = useState("");
  const [status, setStatus] = useState<
    "idle" | "preparing" | "creating" | "confirming" | "seeding" | "confirmed" | "failed"
  >("idle");
  const [message, setMessage] = useState("");
  const resetReview = () => {
    setStatus("idle");
    setMessage("");
  };
  const customCurve = useMemo<ImmutableRateCurve | null>(() => {
    try {
      const curve: ImmutableRateCurve = {
        startBorrowApr: percentToApr(startApr),
        targetUtilizationBps: Math.round(Number(targetUtilization) * 100),
        targetBorrowApr: percentToApr(targetApr),
        maxBorrowApr: percentToApr(maximumApr),
        aboveTargetShape: rateShape,
      };
      validateRateCurve(curve);
      return curve;
    } catch {
      return null;
    }
  }, [startApr, targetUtilization, targetApr, maximumApr, rateShape]);
  const rateCurve = rateChoice === "advanced" ? customCurve : RATE_MODELS[rateChoice].curve;
  const extreme = rateCurve !== null && rateCurve.maxBorrowApr > RATE_SCALE;
  const acknowledgmentRequired = rateCurve !== null && rateCurve.maxBorrowApr > RATE_SCALE * 10n;
  const ratePreview = useMemo(
    () =>
      rateCurve
        ? utilizationPoints.map((percent) => {
            const utilization = (RATE_SCALE * BigInt(percent)) / 100n;
            return {
              percent,
              borrow: borrowAprAtUtilization(rateCurve, utilization),
              lender: lenderAprAtUtilization(rateCurve, utilization, 1000, 500),
            };
          })
        : [],
    [rateCurve],
  );
  const launch = async () => {
    if (!wallet.publicKey) return;
    setStatus("preparing");
    let createdMarket: string | null = null;
    try {
      const result = await buildCreateMarketTransaction({
        marketName,
        collateralMint,
        lltvBps: setupMode === "basic" ? 5000 : lltvBps,
        rateCurve: setupMode === "basic" ? RATE_MODELS.balanced.curve : rateCurve!,
        marketBorrowCap: setupMode === "basic" ? "10000" : marketCap,
        walletBorrowCap: setupMode === "basic" ? "1000" : walletCap,
        initialLiquidity,
        owner: wallet.publicKey,
        connection,
      });
      const latest = await connection.getLatestBlockhash("confirmed");
      result.transaction.feePayer = wallet.publicKey;
      result.transaction.recentBlockhash = latest.blockhash;
      const simulation = await connection.simulateTransaction(result.transaction);
      if (simulation.value.err) {
        const logs = simulation.value.logs?.slice(-6).join("\n");
        throw new Error(
          `Simulation failed: ${JSON.stringify(simulation.value.err)}${logs ? `\n${logs}` : ""}`,
        );
      }
      setStatus("creating");
      const signature = await wallet.sendTransaction(result.transaction, connection, {
        preflightCommitment: "confirmed",
      });
      setStatus("confirming");
      await confirmSignatureByPolling(connection, signature, latest);
      createdMarket = result.market.toBase58();

      setStatus("seeding");
      const liquidityBlockhash = await connection.getLatestBlockhash("confirmed");
      result.liquidityTransaction.feePayer = wallet.publicKey;
      result.liquidityTransaction.recentBlockhash = liquidityBlockhash.blockhash;
      const liquiditySimulation = await connection.simulateTransaction(result.liquidityTransaction);
      if (liquiditySimulation.value.err) {
        const logs = liquiditySimulation.value.logs?.slice(-6).join("\n");
        throw new Error(
          `Market was created, but liquidity preflight failed: ${JSON.stringify(liquiditySimulation.value.err)}${logs ? `\n${logs}` : ""}`,
        );
      }
      const liquiditySignature = await wallet.sendTransaction(
        result.liquidityTransaction,
        connection,
        { preflightCommitment: "confirmed" },
      );
      await confirmSignatureByPolling(connection, liquiditySignature, liquidityBlockhash);
      setMessage(
        `Market ${result.market.toBase58()} launched in ${signature} and funded with ${initialLiquidity} USDC in ${liquiditySignature}`,
      );
      setStatus("confirmed");
      router.push(`/markets/${result.market.toBase58()}`);
    } catch (error) {
      const detail = await errorMessage(error, connection);
      setMessage(
        createdMarket
          ? `Market ${createdMarket} was created, but initial liquidity was not completed. ${detail}`
          : detail,
      );
      setStatus("failed");
    }
  };
  return (
    <section className="card panel span-7">
      <h2>Market configuration</h2>
      {selectedStrategy ? (
        <div className="strategy-prefill">
          <strong>{selectedStrategy.title} settings loaded</strong>
          <span>
            Review and change them below. Nothing is submitted until you press Launch market and
            approve it in your wallet.
          </span>
        </div>
      ) : null}
      <div className="setup-choice" role="tablist" aria-label="Market setup level">
        <button
          type="button"
          className={setupMode === "basic" ? "active" : ""}
          onClick={() => {
            setSetupMode("basic");
            resetReview();
          }}
          role="tab"
          aria-selected={setupMode === "basic"}
        >
          <strong>Basic</strong>
          <span>Add your token and starting USDC. We apply safer standard settings.</span>
        </button>
        <button
          type="button"
          className={setupMode === "advanced" ? "active" : ""}
          onClick={() => {
            setSetupMode("advanced");
            resetReview();
          }}
          role="tab"
          aria-selected={setupMode === "advanced"}
        >
          <strong>Advanced</strong>
          <span>Choose every permanent risk limit and borrowing-rate setting.</span>
        </button>
      </div>
      <div className="asset-pair" aria-label="Market asset pair">
        <div>
          <span>Borrow and lend</span>
          <strong>USDC</strong>
          <small>Fixed protocol loan asset</small>
        </div>
        <span className="asset-pair-arrow" aria-hidden="true">
          ↔
        </span>
        <div>
          <span>Collateral</span>
          <strong>Your memecoin</strong>
          <small>Selected by mint address below</small>
        </div>
      </div>
      <div className="field">
        <label htmlFor="market-name">Market name</label>
        <input
          id="market-name"
          value={marketName}
          maxLength={50}
          onChange={(event) => {
            setMarketName(event.target.value);
            resetReview();
          }}
          placeholder="For example, GPRO Community Market"
        />
        <span className="help">
          A public display name recorded with the market creation transaction. The token / USDC pair
          and immutable address remain visible underneath.
        </span>
      </div>
      <div className="field">
        <label htmlFor="collateral-mint">Memecoin collateral mint</label>
        <input
          id="collateral-mint"
          value={collateralMint}
          onChange={(e) => {
            setCollateralMint(e.target.value);
            resetReview();
          }}
          placeholder="Memecoin mint address"
        />
        <span className="help">
          Token-2022 is supported. Metadata and token-group extensions are allowed; extensions that
          can change balances, fees, transfers, or liquidation behavior are rejected.
        </span>
      </div>
      {setupMode === "basic" ? (
        <div className="basic-preset">
          <div>
            <span>Liquidation limit</span>
            <strong>50% LLTV</strong>
          </div>
          <div>
            <span>Borrowing rates</span>
            <strong>Balanced</strong>
          </div>
          <div>
            <span>Total borrowing limit</span>
            <strong>10,000 USDC</strong>
          </div>
          <div>
            <span>Per-wallet limit</span>
            <strong>1,000 USDC</strong>
          </div>
          <p>
            These permanent settings favor a cautious first market. Choose Advanced if you need
            different terms.
          </p>
        </div>
      ) : null}
      {setupMode === "advanced" ? (
        <>
          <div className="field">
            <label htmlFor="lltv">Liquidation LTV</label>
            <select
              id="lltv"
              value={lltvBps}
              onChange={(e) => {
                setLltvBps(Number(e.target.value) as 3000 | 4000 | 5000 | 6000 | 6500);
                resetReview();
              }}
            >
              <option value={5000}>50% — conservative preset</option>
              <option value={6000}>60% — standard preset</option>
              <option value={6500}>65% — higher leverage</option>
            </select>
          </div>
          <div className="field rate-builder">
            <label htmlFor="rate-model">Borrowing rate terms</label>
            <select
              id="rate-model"
              value={rateChoice}
              onChange={(e) => {
                setRateChoice(e.target.value as RateChoice);
                setExtremeAcknowledged(false);
                resetReview();
              }}
            >
              <option value="borrowerFriendly">Borrower Friendly</option>
              <option value="balanced">Balanced</option>
              <option value="protectLenders">Protect Lenders</option>
              <option value="advanced">Advanced — custom immutable curve</option>
            </select>
            <span className="help">
              The creator chooses what borrowers pay. Lender returns are not guaranteed: they depend
              on how much USDC is borrowed, fees, repayments, liquidity, and market losses. These
              terms cannot be edited after launch.
            </span>
            {rateChoice === "advanced" ? (
              <div className="rate-fields">
                <label>
                  Starting borrow APR (%)
                  <small>The yearly rate when almost none of the supplied USDC is borrowed.</small>
                  <input
                    inputMode="decimal"
                    value={startApr}
                    onChange={(e) => {
                      setStartApr(e.target.value);
                      setExtremeAcknowledged(false);
                      resetReview();
                    }}
                  />
                </label>
                <label>
                  Target utilization (%)
                  <small>
                    The point where the pool is considered busy—for example, 80 USDC used out of
                    100.
                  </small>
                  <input
                    inputMode="decimal"
                    value={targetUtilization}
                    onChange={(e) => {
                      setTargetUtilization(e.target.value);
                      resetReview();
                    }}
                  />
                </label>
                <label>
                  Borrow APR at target (%)
                  <small>What borrowers pay yearly when USDC usage reaches the target above.</small>
                  <input
                    inputMode="decimal"
                    value={targetApr}
                    onChange={(e) => {
                      setTargetApr(e.target.value);
                      setExtremeAcknowledged(false);
                      resetReview();
                    }}
                  />
                </label>
                <label>
                  Maximum borrow APR (%)
                  <small>
                    The highest yearly rate allowed when nearly all available USDC is borrowed.
                  </small>
                  <input
                    inputMode="decimal"
                    value={maximumApr}
                    onChange={(e) => {
                      setMaximumApr(e.target.value);
                      setExtremeAcknowledged(false);
                      resetReview();
                    }}
                  />
                </label>
                <label>
                  Increase above target
                  <small>
                    How quickly borrowing becomes more expensive after the pool passes its target.
                  </small>
                  <select
                    value={rateShape}
                    onChange={(e) => {
                      setRateShape(Number(e.target.value) as RateShape);
                      resetReview();
                    }}
                  >
                    <option value={1}>Linear — rises steadily</option>
                    <option value={2}>Quadratic — gentle, then steep</option>
                    <option value={3}>Cubic — gentlest, then steepest</option>
                  </select>
                </label>
              </div>
            ) : null}
            {!rateCurve ? (
              <p className="unavailable">Enter a valid rate curve.</p>
            ) : (
              <>
                {extreme ? (
                  <div className="risk-banner">
                    <strong>Experimental / high risk</strong>
                    <span>Very high borrowing cost.</span>
                  </div>
                ) : null}
                {acknowledgmentRequired ? (
                  <label className="acknowledgment">
                    <input
                      type="checkbox"
                      checked={extremeAcknowledged}
                      onChange={(e) => setExtremeAcknowledged(e.target.checked)}
                    />
                    I understand this market can charge borrowers more than 1,000% APR and may
                    create debt extremely quickly.
                  </label>
                ) : null}
                <div className="rate-preview">
                  <strong>Exact immutable curve preview</strong>
                  <table>
                    <thead>
                      <tr>
                        <th>USDC used</th>
                        <th>Borrower APR</th>
                        <th>Estimated lender APR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ratePreview.map((row) => (
                        <tr key={row.percent}>
                          <td>{row.percent}%</td>
                          <td>{aprLabel(row.borrow)}</td>
                          <td>{aprLabel(row.lender)} variable</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <small>
                    Calculated with the exact integer formula used on-chain. Estimates are APR, not
                    compounded APY.
                  </small>
                </div>
                {extreme ? (
                  <div className="debt-preview">
                    <strong>If 100 USDC remained borrowed at the maximum APR</strong>
                    {[
                      ["1 hour", 3600n],
                      ["1 day", 86400n],
                      ["30 days", 2592000n],
                      ["1 year", 31536000n],
                    ].map(([label, seconds]) => (
                      <span key={label.toString()}>
                        {label.toString()}:{" "}
                        {Number(
                          projectSimpleAprDebt(
                            100_000_000n,
                            rateCurve.maxBorrowApr,
                            seconds as bigint,
                          ),
                        ) / 1_000_000}{" "}
                        USDC
                      </span>
                    ))}
                  </div>
                ) : null}
              </>
            )}
          </div>
        </>
      ) : null}
      <div className="field creator-economics">
        <span className="field-label">Who receives borrower interest</span>
        <div>
          <span>Market creator</span>
          <strong>10%</strong>
        </div>
        <div>
          <span>Protocol</span>
          <strong>5%</strong>
        </div>
        <div>
          <span>USDC lenders</span>
          <strong>85% variable</strong>
        </div>
        <span className="help">
          The creator earns an immutable share only when borrowers actually pay interest. Creating
          an empty market earns nothing. Fake volume and wash borrowing receive no separate reward
          and still incur interest, fees, and transaction costs.
        </span>
      </div>
      {setupMode === "advanced" ? (
        <>
          <div className="field">
            <label htmlFor="market-cap">Market borrow cap (USDC)</label>
            <input
              id="market-cap"
              inputMode="decimal"
              value={marketCap}
              onChange={(e) => {
                setMarketCap(e.target.value);
                resetReview();
              }}
            />
            <span className="help">
              Permanent ceiling on total outstanding USDC debt in this isolated market. This limits
              aggregate exposure; it is not the amount of liquidity supplied.
            </span>
          </div>
          <div className="field">
            <label htmlFor="wallet-cap">Wallet borrow cap (USDC)</label>
            <input
              id="wallet-cap"
              inputMode="decimal"
              value={walletCap}
              onChange={(e) => {
                setWalletCap(e.target.value);
                resetReview();
              }}
            />
            <span className="help">
              Permanent maximum USDC debt for one wallet. It must not exceed the market cap and does
              not prevent one person from using multiple wallets.
            </span>
          </div>
        </>
      ) : null}
      <div className="field">
        <label htmlFor="initial-liquidity">Initial USDC liquidity</label>
        <input
          id="initial-liquidity"
          inputMode="decimal"
          value={initialLiquidity}
          onChange={(e) => {
            setInitialLiquidity(e.target.value);
            resetReview();
          }}
          placeholder="Amount supplied when the market launches"
        />
        <span className="help">
          Launch uses two wallet approvals so Phantom can clearly preview market creation and the
          USDC supply separately. If the second approval is declined, the market exists without the
          initial liquidity.
        </span>
      </div>
      {message ? (
        <p role="status" className={status === "failed" ? "unavailable" : "help"}>
          {message}
        </p>
      ) : null}
      <button
        className="button primary"
        style={{ width: "100%" }}
        disabled={
          !wallet.connected ||
          status === "preparing" ||
          status === "creating" ||
          status === "confirming" ||
          status === "seeding" ||
          status === "confirmed" ||
          (setupMode === "advanced" && !rateCurve) ||
          (setupMode === "advanced" && acknowledgmentRequired && !extremeAcknowledged)
        }
        onClick={launch}
      >
        {!wallet.connected
          ? "Connect wallet to continue"
          : status === "preparing"
            ? "Checking transaction…"
            : status === "creating"
              ? "Approve market creation…"
              : status === "confirming"
                ? "Confirming market on Solana…"
                : status === "seeding"
                  ? "Approve initial USDC supply…"
                  : status === "confirmed"
                    ? "Market confirmed"
                    : "Launch market"}
      </button>
    </section>
  );
}
