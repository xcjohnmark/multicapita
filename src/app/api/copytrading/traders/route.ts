import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth/viewer";
import { NearIntentsAgentClient } from "@/lib/copytrading/agent-api";
import { filterCopyableOneClickTokens } from "@/lib/copytrading/catalog";
import { SAMPLE_TOP_PERFORMERS } from "@/lib/copytrading/indexer";
import { scoreTraderDeterministically } from "@/lib/copytrading/policy";
import { getPrisma } from "@/lib/db/client";
import { getClient } from "@/lib/near/registry";

export const dynamic = "force-dynamic";

export async function GET() {
  const viewer = await getViewer();
  const prisma = getPrisma();
  const agentClient = new NearIntentsAgentClient();

  const [dbTraders, subscriptions, agentStatus, tokenCatalogue] = await Promise.all([
    prisma.trackedTrader.findMany({
      orderBy: [{ lastIndexedAt: "desc" }, { createdAt: "desc" }],
      take: 25,
    }),
    viewer
      ? prisma.copySubscription.findMany({
          where: { userId: viewer.userId },
          include: { trackedTrader: true },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
    agentClient.checkStatus(),
    getClient()
      .getTokens()
      .catch(() => null),
  ]);

  const liveTraders = dbTraders.map((row) => ({
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
    positions: Array.isArray(row.positionsJson) ? row.positionsJson : [],
    aiSummary: row.aiSummary,
    indexerSources: Array.isArray(row.indexerSources) ? row.indexerSources : [],
    dataMode: row.dataMode,
    lastIndexedAt: row.lastIndexedAt?.toISOString() ?? null,
  }));

  const existingAddresses = new Set(liveTraders.map((t) => t.address.toLowerCase()));
  const sampleFallback = SAMPLE_TOP_PERFORMERS.filter(
    (s) => !existingAddresses.has(s.address.toLowerCase()),
  ).map((sample) => {
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
      aiSummary: `${sample.label} (${score.styleLabel}). Holds ${sample.positions.map((p) => p.symbol).join(", ")} with verified non-memecoin exposure.`,
      indexerSources: ["sample_reference_profile"],
      dataMode: "sample",
      lastIndexedAt: null,
    };
  });

  const allTokens = tokenCatalogue?.tokens ?? [];
  const copyableNonMemeTokens = filterCopyableOneClickTokens(allTokens);

  return NextResponse.json({
    data: {
      traders: [...liveTraders, ...sampleFallback],
      subscriptions,
      agentApi: agentStatus,
      catalogueStats: {
        total1ClickTokens: allTokens.length,
        copyableNonMemeTokens: copyableNonMemeTokens.length,
        excludedMemecoinOrDeprecated: allTokens.length - copyableNonMemeTokens.length,
      },
    },
  });
}
