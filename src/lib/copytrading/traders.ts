import { SAMPLE_TOP_PERFORMERS } from "@/lib/copytrading/indexer";
import { scoreTraderDeterministically, type TraderPositionItem } from "@/lib/copytrading/policy";
import { getPrisma } from "@/lib/db/client";

/**
 * Traders for the Copytrading tab: indexed wallets first, then the clearly-labelled sample
 * reference profiles (dataMode "sample") for anything not yet indexed.
 */

export type TraderCard = {
  id: string;
  address: string;
  ecosystem: string;
  resolvedHandle: string | null;
  label: string | null;
  primaryStyle: string;
  realisedPnl90dUsd: number | null;
  winRatePercent: number | null;
  maxDrawdownPercent: number | null;
  isMemecoinFree: boolean;
  hasExternalHedgeWarning: boolean;
  positions: TraderPositionItem[];
  aiSummary: string | null;
  indexerSources: string[];
  dataMode: string;
  lastIndexedAt: string | null;
};

export async function listTraders(): Promise<TraderCard[]> {
  const rows = await getPrisma().trackedTrader.findMany({
    orderBy: [{ lastIndexedAt: "desc" }, { createdAt: "desc" }],
    take: 25,
  });

  const live: TraderCard[] = rows.map((row) => ({
    id: row.id,
    address: row.address,
    ecosystem: row.ecosystem,
    resolvedHandle: row.resolvedHandle,
    label: row.label,
    primaryStyle: row.primaryStyle,
    realisedPnl90dUsd: row.realisedPnl90dUsd,
    winRatePercent: row.winRatePercent,
    maxDrawdownPercent: row.maxDrawdownPercent,
    isMemecoinFree: row.isMemecoinFree,
    hasExternalHedgeWarning: row.hasExternalHedgeWarning,
    positions: Array.isArray(row.positionsJson) ? (row.positionsJson as TraderPositionItem[]) : [],
    aiSummary: row.aiSummary,
    indexerSources: Array.isArray(row.indexerSources) ? (row.indexerSources as string[]) : [],
    dataMode: row.dataMode,
    lastIndexedAt: row.lastIndexedAt?.toISOString() ?? null,
  }));

  const seen = new Set(live.map((t) => t.address.toLowerCase()));
  const samples: TraderCard[] = SAMPLE_TOP_PERFORMERS.filter((s) => !seen.has(s.address.toLowerCase())).map((sample) => {
    const score = scoreTraderDeterministically({
      positions: sample.positions,
      hasAaveDebt: false,
      winRatePercent: sample.winRatePercent,
      maxDrawdownPercent: sample.maxDrawdownPercent,
    });
    return {
      id: `sample-${sample.address.slice(2, 10)}`,
      address: sample.address,
      ecosystem: sample.ecosystem,
      resolvedHandle: sample.resolvedHandle,
      label: sample.label,
      primaryStyle: sample.primaryStyle,
      realisedPnl90dUsd: sample.realisedPnl90dUsd,
      winRatePercent: sample.winRatePercent,
      maxDrawdownPercent: sample.maxDrawdownPercent,
      isMemecoinFree: score.isMemecoinFree,
      hasExternalHedgeWarning: sample.hasExternalHedgeWarning,
      positions: sample.positions,
      aiSummary: null,
      indexerSources: ["sample_reference_profile"],
      dataMode: "sample",
      lastIndexedAt: null,
    };
  });

  return [...live, ...samples];
}

export async function getTrader(address: string): Promise<TraderCard | null> {
  const norm = address.toLowerCase();
  return (await listTraders()).find((t) => t.address.toLowerCase() === norm) ?? null;
}

export function traderName(trader: Pick<TraderCard, "label" | "resolvedHandle" | "address">): string {
  return trader.label ?? trader.resolvedHandle ?? `${trader.address.slice(0, 6)}…${trader.address.slice(-4)}`;
}
