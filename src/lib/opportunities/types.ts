export type OpportunityStrategyType =
  | "yield_vault"
  | "lending"
  | "stablecoin_lp"
  | "arbitrage"
  | "tokenized_equity";

export type OpportunityInput = {
  strategyType: OpportunityStrategyType;
  protocolSlug: string;
  protocolName: string;
  protocolType: "lending" | "dex" | "vault" | "aggregator";
  websiteUrl?: string;
  docsUrl?: string;
  riskNotes?: string;
  chainId: number;
  tokenOrPairRef: string;
  marketOrPoolAddress?: string;
  estimatedApy: number;
  rateType: "APY" | "APR" | "estimated_net_trade_profit" | "reference_nav_exposure";
  tvlUsd?: number;
  volume24hUsd?: number;
  liquidityUsd?: number;
  feesJson?: Record<string, unknown>;
  withdrawalJson?: Record<string, unknown>;
  riskFlags: string[];
  sourcePayload: Record<string, unknown>;
  dataMode: "live" | "dry_run" | "sample";
  observedAt: Date;
  status: "active" | "stale" | "unsupported" | "rejected";
};

export type SyncResult = {
  syncedCount: number;
  liveCount: number;
  observedAt: string;
  opportunities: Array<{
    id: string;
    strategyType: string;
    protocol: string;
    chainId: number;
    tokenOrPairRef: string;
    estimatedApy: number | null;
    rateType: string | null;
    dataMode: string;
  }>;
};
