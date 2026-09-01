"use client";

import { useState } from "react";
import { ArrowDownToLine, Coins, HandCoins, Landmark } from "lucide-react";
import { TransactionPanel } from "@/components/transaction-panel";
import type { MarketAction } from "@/lib/transactions";

type ActionOption = {
  action: MarketAction;
  label: string;
  description: string;
  risk: string;
  icon: typeof Landmark;
};

const lenderActions: ActionOption[] = [
  {
    action: "Supply",
    label: "Supply USDC",
    description: "Earn yield from borrowers in this isolated market.",
    risk: "You accept this market’s collateral, oracle, liquidity, and liquidation risk.",
    icon: Landmark,
  },
  {
    action: "Withdraw",
    label: "Withdraw USDC",
    description: "Redeem your lender shares for available USDC.",
    risk: "Withdrawals depend on available market liquidity and your lender share balance.",
    icon: ArrowDownToLine,
  },
];

const borrowerActions: ActionOption[] = [
  {
    action: "Borrow",
    label: "Get USDC",
    description: "Deposit your memecoin and borrow USDC in one step.",
    risk: "Borrowing requires a fresh oracle price and must remain below every immutable cap.",
    icon: HandCoins,
  },
  {
    action: "Deposit collateral",
    label: "Make my loan safer",
    description: "Add memecoin collateral without borrowing more USDC.",
    risk: "More collateral lowers liquidation risk and remains available even if the oracle fails.",
    icon: Coins,
  },
  {
    action: "Repay",
    label: "Repay USDC",
    description: "Reduce debt and improve your position health.",
    risk: "Repayment stays available even if the oracle fails or borrowing is paused.",
    icon: ArrowDownToLine,
  },
];

export function MarketActions({
  market,
  collateralSymbol,
}: {
  market: string;
  collateralSymbol?: string | null;
}) {
  const [mode, setMode] = useState<"lend" | "borrow">("lend");
  const [selected, setSelected] = useState<MarketAction>("Supply");
  const actions = mode === "lend" ? lenderActions : borrowerActions;
  const active = actions.find((item) => item.action === selected) ?? actions[0];
  const Icon = active.icon;

  const selectMode = (next: "lend" | "borrow") => {
    setMode(next);
    setSelected(next === "lend" ? "Supply" : "Borrow");
  };

  return (
    <section className="market-workspace" aria-label="Market actions">
      <div className="market-mode-tabs" role="tablist" aria-label="Choose how to use this market">
        <button
          className={mode === "lend" ? "active" : ""}
          onClick={() => selectMode("lend")}
          role="tab"
          aria-selected={mode === "lend"}
        >
          I want to lend
        </button>
        <button
          className={mode === "borrow" ? "active" : ""}
          onClick={() => selectMode("borrow")}
          role="tab"
          aria-selected={mode === "borrow"}
        >
          I want to borrow
        </button>
      </div>
      <div className="benefit-strip">
        {mode === "lend" ? (
          <>
            <div>
              <strong>Put your USDC to work</strong>
              <span>Borrowers pay interest to USDC lenders.</span>
            </div>
            <div>
              <strong>Withdraw when cash is available</strong>
              <span>Your return changes with borrowing demand and market losses.</span>
            </div>
          </>
        ) : (
          <>
            <div>
              <strong>Keep your memecoin exposure</strong>
              <span>Use it as collateral instead of selling it to receive USDC.</span>
            </div>
            <div>
              <strong>Repay to unlock your collateral</strong>
              <span>Add safety or repay before the position reaches liquidation.</span>
            </div>
          </>
        )}
      </div>
      <div className="market-workspace-body">
        <div className="market-action-menu">
          <span className="eyebrow">Choose an action</span>
          {actions.map((item) => (
            <button
              key={item.action}
              className={active.action === item.action ? "active" : ""}
              onClick={() => setSelected(item.action)}
            >
              <item.icon aria-hidden="true" size={18} />
              <span>
                <strong>{item.label}</strong>
                <small>{item.description}</small>
              </span>
            </button>
          ))}
        </div>
        <div className="market-action-card">
          <div className="market-action-intro">
            <span className="architecture-icon">
              <Icon aria-hidden="true" size={18} />
            </span>
            <div>
              <strong>{active.label}</strong>
              <p>{active.description}</p>
            </div>
          </div>
          <TransactionPanel
            action={active.action}
            market={market}
            risk={active.risk}
            collateralSymbol={collateralSymbol}
          />
        </div>
      </div>
    </section>
  );
}
