/**
 * Opportunity tabs on the platform. Client-safe (no server imports): the tab bar, the cards and
 * the server queries all read the same table.
 */

export const OPPORTUNITY_TABS = [
  { slug: "lending", label: "Lending", strategyType: "lending", blurb: "Supply assets, earn a variable rate" },
  { slug: "vaults", label: "Vaults", strategyType: "yield_vault", blurb: "Curated vaults that compound for you" },
  { slug: "pools", label: "Pools", strategyType: "stablecoin_lp", blurb: "Stablecoin liquidity, trading fees" },
  { slug: "stocks", label: "Stocks & gold", strategyType: "tokenized_equity", blurb: "Tokenized equities and gold" },
  { slug: "arbitrage", label: "Arbitrage", strategyType: "arbitrage", blurb: "Cross-chain price gaps" },
  { slug: "copytrading", label: "Copytrading", strategyType: null, blurb: "Follow verified wallets" },
] as const;

export type OpportunityTab = (typeof OPPORTUNITY_TABS)[number];
export type OpportunityTabSlug = OpportunityTab["slug"];

export function findTab(slug: string): OpportunityTab | null {
  return OPPORTUNITY_TABS.find((tab) => tab.slug === slug) ?? null;
}

export function tabForStrategy(strategyType: string): OpportunityTabSlug {
  return OPPORTUNITY_TABS.find((tab) => tab.strategyType === strategyType)?.slug ?? "lending";
}

export const CHAIN_LABELS: Record<number, string> = { 8453: "Base", 42161: "Arbitrum", 1: "Ethereum" };

export function chainLabel(chainId: number): string {
  return CHAIN_LABELS[chainId] ?? `Chain ${chainId}`;
}

/** Human labels for stored risk flags (never shown as raw snake_case). */
const RISK_LABELS: Record<string, string> = {
  variable_rate: "Variable rate",
  withdrawal_liquidity: "Withdrawal liquidity",
  share_price_changes: "Share price moves",
  third_party_vault: "Third-party curator",
  stablecoin_depeg: "Depeg risk",
  concentrated_liquidity: "Concentrated range",
  cross_chain_delay: "Cross-chain delay",
  execution_price_slippage: "Execution slippage",
  non_atomic: "Not atomic",
  us_market_closed: "US market closed",
  nav_spread_200_bps: "Wide NAV spread",
  issuer_orderbook_only: "Issuer order book only",
  route_via_1click: "Routed via 1Click",
  impermanent_loss: "Impermanent loss",
};

export function riskLabel(flag: string): string {
  if (RISK_LABELS[flag]) return RISK_LABELS[flag];
  const text = flag.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
