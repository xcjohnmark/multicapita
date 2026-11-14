import { getPrisma } from "@/lib/db/client";
import { getMarketSessionStatus, getVerifiedEquityAsset } from "@/lib/protocols/equities";
import { findTab, type OpportunityTabSlug } from "./tabs";

/**
 * Read side of the opportunity tabs. Everything a card shows comes from the stored row and its
 * own provenance (`dataMode`, `observedAt`, `sourcePayload`); nothing is filled in.
 */

export type OpportunityCardData = {
  id: string;
  tab: OpportunityTabSlug;
  strategyType: string;
  protocolName: string;
  protocolSlug: string;
  chainId: number;
  title: string;
  assetSymbols: string[];
  ratePercent: number | null;
  rateType: string | null;
  tvlUsd: number | null;
  volume24hUsd: number | null;
  liquidityUsd: number | null;
  riskFlags: string[];
  dataMode: string;
  observedAt: string;
  sparkline: number[];
  // Arbitrage
  expectedProfitUsd: number | null;
  tradeSizeUsd: number | null;
  route: { from: number; to: number } | null;
  // Stocks
  issuer: string | null;
  ticker: string | null;
  navUsd: number | null;
  spreadBps: number | null;
  session: "OPEN" | "EXTENDED" | "CLOSED" | null;
  isCommodity: boolean;
};

export type OpportunitySort = "rate" | "tvl" | "risk" | "recent";

function riskFlags(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((item): item is string => typeof item === "string");
  if (raw && typeof raw === "object") {
    return Object.entries(raw as Record<string, unknown>)
      .filter(([, value]) => Boolean(value))
      .map(([key]) => key);
  }
  return [];
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function symbolsFrom(ref: string, strategyType: string): string[] {
  if (strategyType === "arbitrage") return [ref.split(/[\s:]/)[0] || "WETH", "USDC"];
  if (strategyType === "yield_vault") return [ref.split("→")[0]?.trim() || "USDC"];
  const pair = ref.split(/\s/)[0];
  return pair.includes("/") ? pair.split("/").slice(0, 2) : [pair];
}

type Row = Awaited<ReturnType<typeof loadRows>>[number];

async function loadRows(where: { strategyType?: string; id?: string }) {
  return getPrisma().opportunity.findMany({
    where: { ...where, status: "active" },
    include: {
      protocol: true,
      observations: { orderBy: { observedAt: "desc" }, take: 30, select: { rate: true, observedAt: true } },
    },
    orderBy: [{ estimatedApy: { sort: "desc", nulls: "last" } }],
  });
}

export function toCard(row: Row, now = new Date()): OpportunityCardData {
  const payload = (row.sourcePayload ?? {}) as Record<string, unknown>;
  const isEquity = row.strategyType === "tokenized_equity";
  const equity = isEquity && row.marketOrPoolAddress ? getVerifiedEquityAsset(row.chainId, row.marketOrPoolAddress) : null;
  const isCommodity = equity?.wrapperType === "physical_commodity";
  const spread = num(payload.navDeviationBps);
  const tab = findTab(
    row.strategyType === "yield_vault"
      ? "vaults"
      : row.strategyType === "stablecoin_lp"
        ? "pools"
        : row.strategyType === "tokenized_equity"
          ? "stocks"
          : row.strategyType,
  );

  return {
    id: row.id,
    tab: tab?.slug ?? "lending",
    strategyType: row.strategyType,
    protocolName: row.protocol.name,
    protocolSlug: row.protocol.slug,
    chainId: row.chainId,
    title: equity ? equity.name : row.tokenOrPairRef,
    assetSymbols: equity ? [equity.symbol] : symbolsFrom(row.tokenOrPairRef, row.strategyType),
    ratePercent: isEquity || row.strategyType === "arbitrage" ? null : row.estimatedApy,
    rateType: row.rateType,
    tvlUsd: row.tvlUsd,
    volume24hUsd: row.volume24hUsd,
    liquidityUsd: row.liquidityUsd,
    riskFlags: riskFlags(row.riskFlags),
    dataMode: row.dataMode,
    observedAt: row.observedAt.toISOString(),
    sparkline: row.observations
      .map((o) => o.rate)
      .filter((rate): rate is number => rate !== null)
      .reverse(),
    expectedProfitUsd: num(payload.expectedProfitUsd),
    tradeSizeUsd: num(payload.tradeSizeUsd),
    route: row.strategyType === "arbitrage" ? { from: row.chainId, to: row.chainId === 8453 ? 42161 : 8453 } : null,
    issuer: equity?.issuer ?? null,
    ticker: equity?.underlyingTicker ?? null,
    navUsd: num(payload.referenceNavUsd),
    // 9999 bps is the evaluator's "no price" marker on rows synced before it stopped being stored.
    spreadBps: spread !== null && spread < 9999 ? spread : null,
    session: isEquity ? getMarketSessionStatus(now, isCommodity) : null,
    isCommodity,
  };
}

export async function listOpportunities(input: {
  tab: OpportunityTabSlug;
  chain?: number | null;
  q?: string | null;
  sort?: OpportunitySort;
  asset?: string | null;
}): Promise<OpportunityCardData[]> {
  const tab = findTab(input.tab);
  if (!tab?.strategyType) return [];
  const rows = await loadRows({ strategyType: tab.strategyType });
  const q = input.q?.trim().toLowerCase() ?? "";
  const cards = rows
    .map((row) => toCard(row))
    .filter((card) => (input.chain ? card.chainId === input.chain : true))
    .filter((card) =>
      q ? [card.title, card.protocolName, ...card.assetSymbols, card.ticker ?? ""].join(" ").toLowerCase().includes(q) : true,
    )
    .filter((card) => {
      if (!input.asset || input.asset === "all") return true;
      const stable = card.assetSymbols.every((s) => /USD|EUR|DAI/i.test(s));
      return input.asset === "stable" ? stable : !stable;
    });

  const sort = input.sort ?? "rate";
  const by: Record<OpportunitySort, (a: OpportunityCardData, b: OpportunityCardData) => number> = {
    rate: (a, b) => (b.ratePercent ?? b.expectedProfitUsd ?? -1) - (a.ratePercent ?? a.expectedProfitUsd ?? -1),
    tvl: (a, b) => (b.tvlUsd ?? -1) - (a.tvlUsd ?? -1),
    risk: (a, b) => a.riskFlags.length - b.riskFlags.length,
    recent: (a, b) => b.observedAt.localeCompare(a.observedAt),
  };
  return cards.sort(by[sort]);
}

export async function getOpportunityDetail(id: string) {
  const row = await getPrisma().opportunity.findUnique({
    where: { id },
    include: {
      protocol: true,
      observations: { orderBy: { observedAt: "asc" }, take: 90 },
    },
  });
  if (!row) return null;
  const card = toCard({ ...row, observations: row.observations.map((o) => ({ rate: o.rate, observedAt: o.observedAt })) });
  return {
    card,
    status: row.status,
    marketOrPoolAddress: row.marketOrPoolAddress,
    fees: (row.feesJson ?? null) as Record<string, unknown> | null,
    withdrawal: (row.withdrawalJson ?? null) as Record<string, unknown> | null,
    payload: (row.sourcePayload ?? {}) as Record<string, unknown>,
    protocol: {
      name: row.protocol.name,
      slug: row.protocol.slug,
      websiteUrl: row.protocol.websiteUrl,
      docsUrl: row.protocol.docsUrl,
      riskNotes: row.protocol.riskNotes,
    },
    observations: row.observations.map((o) => ({
      observedAt: o.observedAt.toISOString(),
      rate: o.rate,
      tvlUsd: o.tvlUsd,
      dataMode: o.dataMode,
    })),
  };
}

/** Best opportunities per tab for the Home page. */
export async function topOpportunities(perTab = 3) {
  const rows = await loadRows({});
  const cards = rows.map((row) => toCard(row));
  const out: Record<string, OpportunityCardData[]> = {};
  for (const card of cards) {
    const list = (out[card.tab] ??= []);
    if (list.length < perTab) list.push(card);
  }
  return out;
}
