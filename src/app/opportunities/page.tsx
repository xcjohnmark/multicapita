import {
  OpportunitiesExplorer,
  type SerializedOpportunity,
} from "@/components/opportunities/opportunities-explorer";
import { getPrisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";

function extractRiskFlags(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((item): item is string => typeof item === "string");
  }
  if (raw && typeof raw === "object") {
    return Object.entries(raw as Record<string, unknown>)
      .filter(([, value]) => Boolean(value))
      .map(([key]) => key);
  }
  return [];
}

export default async function OpportunitiesPage() {
  const opportunities = await getPrisma().opportunity.findMany({
    where: { status: "active" },
    include: { protocol: true },
    orderBy: [{ strategyType: "asc" }, { estimatedApy: { sort: "desc", nulls: "last" } }],
  });

  const serialized: SerializedOpportunity[] = opportunities.map((row) => {
    const payload = row.sourcePayload as
      | { expectedProfitUsd?: unknown; navDeviationBps?: unknown }
      | null
      | undefined;
    const expectedProfitUsd =
      typeof payload?.expectedProfitUsd === "number" ? payload.expectedProfitUsd : null;
    const isEquity = row.strategyType === "tokenized_equity";
    // 9999 bps is the evaluator's "no price" marker on rows synced before it stopped being stored.
    const navDeviationBps =
      isEquity && typeof payload?.navDeviationBps === "number" && payload.navDeviationBps < 9999
        ? payload.navDeviationBps
        : null;

    return {
      id: row.id,
      strategyType: row.strategyType,
      protocolName: row.protocol.name,
      chainId: row.chainId,
      tokenOrPairRef: row.tokenOrPairRef,
      marketOrPoolAddress: row.marketOrPoolAddress,
      estimatedApy: isEquity ? null : row.estimatedApy,
      rateType: row.rateType,
      tvlUsd: row.tvlUsd,
      volume24hUsd: row.volume24hUsd,
      liquidityUsd: row.liquidityUsd,
      riskFlags: extractRiskFlags(row.riskFlags),
      expectedProfitUsd,
      navDeviationBps,
      dataMode: row.dataMode,
      observedAtIso: row.observedAt.toISOString(),
      status: row.status,
    };
  });

  return <OpportunitiesExplorer opportunities={serialized} />;
}
