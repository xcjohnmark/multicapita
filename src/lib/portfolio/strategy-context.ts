import { getPrisma } from "@/lib/db/client";
import { getChain } from "@/lib/chains";
import { DEFAULT_GUARDRAILS, guardrailsSchema, type Guardrails } from "@/lib/domain/strategy";
import type { OpportunityView, PortfolioExposure } from "@/lib/policy/engine";
import { buildExposure, toOpportunityView } from "./exposure";

/**
 * Assembles everything the strategy layer needs, in one place.
 *
 * Returns `null` when there is no seeded/connected portfolio, so callers render an empty state
 * instead of planning against zeros.
 */

export type StrategyContext = {
  userId: string;
  profileId: string | null;
  guardrails: Guardrails;
  opportunities: OpportunityView[];
  portfolio: PortfolioExposure;
  target: { totalUsd: number; availableUsd: number };
  dataMode: string;
};

export function chainName(chainId: number): string {
  return getChain(chainId)?.name ?? `Chain ${chainId}`;
}

export async function loadStrategyContext(userId: string): Promise<StrategyContext | null> {
  const prisma = getPrisma();

  const [snapshot, positions, opportunityRows, profile, protocols] = await Promise.all([
    prisma.portfolioSnapshot.findFirst({
      where: { userId },
      orderBy: { snapshotAt: "desc" },
      include: { balances: { include: { token: true } } },
    }),
    prisma.position.findMany({
      where: { userId },
      include: { protocol: true, receiptToken: true },
    }),
    prisma.opportunity.findMany({
      include: { protocol: true },
      orderBy: { estimatedApy: "desc" },
    }),
    prisma.strategyProfile.findFirst({
      where: { userId, isActive: true },
      include: { constraints: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.protocol.findMany({ select: { id: true, slug: true } }),
  ]);

  if (!snapshot) return null;

  const portfolio = buildExposure({
    balances: snapshot.balances.map((balance) => ({
      valueUsd: balance.valueUsd,
      token: { chainId: balance.token.chainId, symbol: balance.token.symbol },
    })),
    positions: positions.map((position) => ({
      chainId: position.chainId,
      strategyType: position.strategyType,
      currentValueUsd: position.currentValueUsd,
      status: position.status,
      underlyingAssetIds: position.underlyingAssetIds,
      receiptToken: position.receiptToken ? { symbol: position.receiptToken.symbol } : null,
      protocol: { slug: position.protocol.slug, name: position.protocol.name },
    })),
  });

  const opportunities = opportunityRows
    .map((row) => toOpportunityView(row, chainName))
    .filter((value): value is OpportunityView => value !== null);

  const guardrails = profile?.constraints
    ? guardrailsFromRow(
        profile.constraints,
        new Map(protocols.map((protocol) => [protocol.id, protocol.slug])),
      )
    : DEFAULT_GUARDRAILS;

  return {
    userId,
    profileId: profile?.id ?? null,
    guardrails,
    opportunities,
    portfolio,
    target: {
      totalUsd: Number(portfolio.totalUsdCents) / 100,
      availableUsd: Number(portfolio.availableUsdCents) / 100,
    },
    dataMode: snapshot.dataMode,
  };
}

type ConstraintRow = {
  minLiquidPercent: number;
  maxProtocolExposurePercent: number;
  maxAssetExposurePercent: number;
  maxChainExposurePercent: number;
  maxStrategyExposurePercent: number;
  maxSlippageBps: number;
  maxGasUsd: number;
  minArbitrageProfitUsd: number;
  approvedChainIds: unknown;
  approvedProtocolIds: unknown;
  requiresUserApproval: boolean;
};

function guardrailsFromRow(row: ConstraintRow, protocolSlugById?: Map<string, string>): Guardrails {
  const parsed = guardrailsSchema.safeParse({
    minLiquidPercent: row.minLiquidPercent,
    maxProtocolExposurePercent: row.maxProtocolExposurePercent,
    maxAssetExposurePercent: row.maxAssetExposurePercent,
    maxChainExposurePercent: row.maxChainExposurePercent,
    maxStrategyExposurePercent: row.maxStrategyExposurePercent,
    maxSlippageBps: row.maxSlippageBps,
    maxGasUsd: row.maxGasUsd,
    minArbitrageProfitUsd: row.minArbitrageProfitUsd,
    approvedChainIds: Array.isArray(row.approvedChainIds)
      ? row.approvedChainIds.filter((id): id is number => typeof id === "number")
      : null,
    approvedProtocols: Array.isArray(row.approvedProtocolIds)
      ? row.approvedProtocolIds
          .filter((id): id is string => typeof id === "string")
          .map((id) => protocolSlugById?.get(id) ?? id)
      : null,
    requiresUserApproval: row.requiresUserApproval,
  });

  // A malformed constraint row must not silently become "no restrictions".
  return parsed.success ? parsed.data : DEFAULT_GUARDRAILS;
}
