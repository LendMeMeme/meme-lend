import { RATE_SCALE, type ImmutableRateCurve } from "@meme-lend/sdk";

export type StrategyId =
  "balanced" | "borrower-friendly" | "protect-lenders" | "low-liquidity" | "incentivized-launch";

const apr = (percent: number) => (RATE_SCALE * BigInt(percent)) / 100n;

export type MarketStrategy = {
  id: StrategyId;
  title: string;
  bestFor: string;
  borrowerBenefit: string;
  lenderBenefit: string;
  risk: string;
  riskLevel: "Lower" | "Moderate" | "High";
  lltvBps: 3000 | 4000 | 5000;
  curve: ImmutableRateCurve;
  walletCap: string;
  reserve: string;
};

export const strategies: MarketStrategy[] = [
  {
    id: "balanced",
    title: "Balanced",
    bestFor: "Attracting both borrowers and lenders",
    borrowerBenefit: "Rates start low while plenty of USDC is available.",
    lenderBenefit: "Rates rise as more of the pool is borrowed.",
    risk: "Neither side receives maximum priority.",
    riskLevel: "Moderate",
    lltvBps: 5000,
    curve: {
      startBorrowApr: apr(2),
      targetUtilizationBps: 8000,
      targetBorrowApr: apr(20),
      maxBorrowApr: apr(220),
      aboveTargetShape: 2,
    },
    walletCap: "5% of the market cap",
    reserve: "10% of initial liquidity",
  },
  {
    id: "borrower-friendly",
    title: "Borrower Friendly",
    bestFor: "Affordable USDC borrowing for token owners",
    borrowerBenefit: "Lower borrowing costs across most pool conditions.",
    lenderBenefit: "More affordable loans may attract borrowing demand.",
    risk: "Lenders may earn very little when utilization is low.",
    riskLevel: "Moderate",
    lltvBps: 5000,
    curve: {
      startBorrowApr: apr(1),
      targetUtilizationBps: 8500,
      targetBorrowApr: apr(10),
      maxBorrowApr: apr(100),
      aboveTargetShape: 1,
    },
    walletCap: "5% of the market cap",
    reserve: "10% of initial liquidity",
  },
  {
    id: "protect-lenders",
    title: "Protect Lenders",
    bestFor: "Stronger lender returns and liquidity protection",
    borrowerBenefit: "A more conservative collateral limit reduces sudden-loss exposure.",
    lenderBenefit: "Rates respond strongly when available USDC becomes scarce.",
    risk: "Borrowing is more expensive.",
    riskLevel: "Moderate",
    lltvBps: 4000,
    curve: {
      startBorrowApr: apr(5),
      targetUtilizationBps: 7000,
      targetBorrowApr: apr(30),
      maxBorrowApr: apr(330),
      aboveTargetShape: 3,
    },
    walletCap: "3% of the market cap",
    reserve: "15% of initial liquidity",
  },
  {
    id: "low-liquidity",
    title: "New or Low-Liquidity Token",
    bestFor: "Volatile or thinly traded collateral",
    borrowerBenefit: "Creates a lending option with deliberately smaller limits.",
    lenderBenefit: "Lower leverage and faster rate increases add protection.",
    risk: "Thin liquidity can still produce bad debt despite conservative settings.",
    riskLevel: "High",
    lltvBps: 3000,
    curve: {
      startBorrowApr: apr(10),
      targetUtilizationBps: 6000,
      targetBorrowApr: apr(50),
      maxBorrowApr: apr(500),
      aboveTargetShape: 3,
    },
    walletCap: "1% of the market cap",
    reserve: "At least 25% of initial liquidity",
  },
  {
    id: "incentivized-launch",
    title: "Incentivized Launch",
    bestFor: "Attracting the first USDC lenders",
    borrowerBenefit: "Uses the same reasonable borrowing curve as Balanced.",
    lenderBenefit: "Separately funded, temporary token rewards may supplement interest.",
    risk: "Rewards do not remove collateral, liquidity, or bad-debt risk.",
    riskLevel: "High",
    lltvBps: 5000,
    curve: {
      startBorrowApr: apr(2),
      targetUtilizationBps: 8000,
      targetBorrowApr: apr(20),
      maxBorrowApr: apr(220),
      aboveTargetShape: 2,
    },
    walletCap: "5% of the market cap",
    reserve: "10% of initial liquidity",
  },
];

export const strategyById = (id: string | undefined) => strategies.find((item) => item.id === id);
export const strategyHref = (id: StrategyId) => `/create-market?strategy=${id}`;

export function recommendStrategy(input: {
  priority: "borrowers" | "both" | "lenders";
  collateralRisk: "lower" | "volatile" | "very-high";
  initialLiquidity: number;
}): StrategyId {
  if (input.collateralRisk === "very-high" || input.initialLiquidity < 1_000)
    return "low-liquidity";
  if (input.priority === "borrowers") return "borrower-friendly";
  if (input.priority === "lenders") return "protect-lenders";
  return "balanced";
}
