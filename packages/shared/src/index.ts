export type MarketStatus = "Unverified" | "Community" | "Established" | "Curated" | "Restricted";
export type OracleKind = "Pyth" | "Switchboard" | "DexTwap" | "AggregatedPools" | "Custom";

export interface StatusReason {
  code: string;
  label: string;
  detail: string;
}
export type MarketTagTone = "positive" | "neutral" | "warning" | "critical";
export interface MarketTag {
  code: string;
  label: string;
  detail: string;
  tone: MarketTagTone;
  priority: number;
}
export interface MarketView {
  address: string;
  collateralMint: string;
  collateralName: string | null;
  collateralSymbol: string | null;
  loanMint: string;
  creator: string;
  status: MarketStatus;
  statusReasons: StatusReason[];
  tags?: MarketTag[];
  oracleKind: OracleKind;
  customOracleHighRisk: boolean;
  lltvBps: number;
  supplyAprBps: number | null;
  borrowAprBps: number | null;
  rateCurve?: {
    startBorrowApr: string;
    targetUtilizationBps: number;
    targetBorrowApr: string;
    maxBorrowApr: string;
    aboveTargetShape: 1 | 2 | 3;
  };
  extremeRateRisk?: boolean;
  suppliedUsdc: string;
  borrowedUsdc: string;
  availableUsdc: string;
  utilizationBps: number;
  firstLossReserve: string;
  badDebt: string;
  oraclePublishedAt: string | null;
  collateralLiquidityUsd: string | null;
  estimatedSellSlippageBps: number | null;
  slot: number;
  updatedAt: string;
}

export interface IndexedTransaction {
  id: string;
  signature: string;
  eventIndex: number;
  slot: number;
  blockTime: string | null;
  market: string | null;
  event: string;
  actor: string | null;
  payload: Record<string, unknown>;
}

export interface OracleObservationView {
  id: string;
  market: string;
  publisher: string;
  price: string;
  confidenceBps: number;
  deviationBps: number;
  maxRecoverableUsdc: string;
  publishedAt: string;
  slot: number;
}
