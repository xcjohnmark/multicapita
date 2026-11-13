import {
  CopytradingHub,
  type SerializedSubscription,
  type SerializedTrader,
} from "@/components/copytrading/copytrading-hub";
import { getViewer } from "@/lib/auth/viewer";
import { NearIntentsAgentClient } from "@/lib/copytrading/agent-api";
import { filterCopyableOneClickTokens } from "@/lib/copytrading/catalog";
import { SAMPLE_TOP_PERFORMERS } from "@/lib/copytrading/indexer";
import { scoreTraderDeterministically, type TraderPositionItem } from "@/lib/copytrading/policy";
import { getPrisma } from "@/lib/db/client";
import { getClient } from "@/lib/near/registry";

export const dynamic = "force-dynamic";

export default async function CopytradingPage() {
  const viewer = await getViewer();
  const prisma = getPrisma();
  const agentClient = new NearIntentsAgentClient();

  const [dbTraders, dbSubscriptions, tokenCatalogue] = await Promise.all([
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
    getClient()
      .getTokens()
      .catch(() => null),
  ]);

  const liveTraders: SerializedTrader[] = dbTraders.map((row) => ({
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
    positions: Array.isArray(row.positionsJson)
      ? (row.positionsJson as TraderPositionItem[])
      : [],
    aiSummary: row.aiSummary,
    indexerSources: Array.isArray(row.indexerSources)
      ? (row.indexerSources as string[])
      : [],
    dataMode: row.dataMode,
    lastIndexedAt: row.lastIndexedAt?.toISOString() ?? null,
  }));

  const seen = new Set(liveTraders.map((t) => t.address.toLowerCase()));
  const sampleTraders: SerializedTrader[] = SAMPLE_TOP_PERFORMERS.filter(
    (s) => !seen.has(s.address.toLowerCase()),
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
      aiSummary: `${sample.label} (${score.styleLabel}). Holds ${sample.positions
        .map((p) => p.symbol)
        .join(", ")} with verified non-memecoin exposure.`,
      indexerSources: ["sample_reference_profile"],
      dataMode: "sample",
      lastIndexedAt: null,
    };
  });

  const subscriptions: SerializedSubscription[] = dbSubscriptions.map((sub) => ({
    id: sub.id,
    fundingNearAccountId: sub.fundingNearAccountId,
    executionMode: sub.executionMode,
    maxUsdPerTrade: sub.maxUsdPerTrade,
    maxDailyBudgetUsd: sub.maxDailyBudgetUsd,
    dailyUsedUsd: sub.dailyUsedUsd,
    copyScaleBps: sub.copyScaleBps,
    maxPriceDriftBps: sub.maxPriceDriftBps,
    copySpot1Click: sub.copySpot1Click,
    copyVaults: sub.copyVaults,
    copyLending: sub.copyLending,
    copyLp: sub.copyLp,
    noMemecoinsOnly: sub.noMemecoinsOnly,
    status: sub.status,
    trackedTrader: {
      address: sub.trackedTrader.address,
      resolvedHandle: sub.trackedTrader.resolvedHandle,
      label: sub.trackedTrader.label,
      primaryStyle: sub.trackedTrader.primaryStyle,
    },
  }));

  const allTokens = tokenCatalogue?.tokens ?? [];
  const copyableNonMemeTokens = filterCopyableOneClickTokens(allTokens);

  return (
    <CopytradingHub
      initialTraders={[...liveTraders, ...sampleTraders]}
      initialSubscriptions={subscriptions}
      agentApiConfigured={agentClient.isConfigured}
      catalogueStats={{
        total1ClickTokens: allTokens.length,
        copyableNonMemeTokens: copyableNonMemeTokens.length,
        excludedMemecoinOrDeprecated: allTokens.length - copyableNonMemeTokens.length,
      }}
    />
  );
}
