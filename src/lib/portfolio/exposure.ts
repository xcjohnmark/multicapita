import type { StrategyType } from "@/lib/domain/strategy";
import type { OpportunityView, PortfolioExposure } from "@/lib/policy/engine";

/**
 * Mapping between persisted records and the pure policy engine's view of the world.
 *
 * Kept in one place so the engine never has to know about Prisma rows, and so the definition of
 * "exposure to USDC" is a single tested function rather than an implicit assumption in a query.
 */

/**
 * The asset a position or opportunity actually exposes capital to.
 *
 * A vault leg written as "USDC → gtUSDCp" is USDC exposure: the receipt token is a claim on
 * underlying USDC, so counting both would double-count. LP labels carry a pair and a fee tier,
 * neither of which is part of asset identity — "USDC/USDT 0.01%" is USDC-first exposure.
 */
export function deriveAssetKey(tokenOrPairRef: string): string {
  const beforeArrow = tokenOrPairRef.split(/[→>]/)[0] ?? tokenOrPairRef;
  const firstToken = beforeArrow.trim().split(/[\s/]+/)[0] ?? "unknown";
  return firstToken.length > 0 ? firstToken : "unknown";
}

export type OpportunityRow = {
  id: string;
  strategyType: string;
  tokenOrPairRef: string;
  chainId: number;
  estimatedApy: number | null;
  rateType: string | null;
  liquidityUsd: number | null;
  dataMode: string;
  status: string;
  expiresAt: Date | null;
  riskFlags: unknown;
  protocol: { slug: string; name: string };
};

const STRATEGY_TYPES: readonly StrategyType[] = [
  "yield_vault",
  "lending",
  "stablecoin_lp",
  "arbitrage",
];

export function toOpportunityView(
  row: OpportunityRow,
  chainName: (chainId: number) => string,
): OpportunityView | null {
  if (!STRATEGY_TYPES.includes(row.strategyType as StrategyType)) return null;
  const flags = Array.isArray(row.riskFlags)
    ? row.riskFlags.filter((flag): flag is string => typeof flag === "string")
    : [];

  return {
    id: row.id,
    strategyType: row.strategyType as StrategyType,
    protocolSlug: row.protocol.slug,
    protocolName: row.protocol.name,
    chainId: row.chainId,
    chainName: chainName(row.chainId),
    assetLabel: row.tokenOrPairRef,
    assetKey: deriveAssetKey(row.tokenOrPairRef),
    expectedRatePercent: row.estimatedApy,
    rateType: row.rateType,
    status: row.status,
    dataMode: row.dataMode,
    expiresAt: row.expiresAt,
    liquidityUsd: row.liquidityUsd,
    // Arbitrage profitability must come from an executable quote, never from a displayed spread.
    expectedProfitUsd: null,
    riskFlags: flags,
  };
}

export type BalanceRow = {
  valueUsd: number | null;
  token: { chainId: number; symbol: string };
};

export type PositionRow = {
  chainId: number;
  strategyType: string;
  currentValueUsd: number | null;
  status: string;
  underlyingAssetIds: unknown;
  receiptToken: { symbol: string } | null;
  protocol: { slug: string; name: string };
};

function add(record: Record<string, bigint>, key: string, cents: bigint): void {
  record[key] = (record[key] ?? 0n) + cents;
}

export function buildExposure(input: {
  balances: BalanceRow[];
  positions: PositionRow[];
}): PortfolioExposure {
  const byChain: Record<string, bigint> = {};
  const byProtocol: Record<string, bigint> = {};
  const byStrategy: Record<string, bigint> = {};
  const byAsset: Record<string, bigint> = {};

  let availableCents = 0n;

  for (const balance of input.balances) {
    const cents = BigInt(Math.round((balance.valueUsd ?? 0) * 100));
    availableCents += cents;
    add(byChain, String(balance.token.chainId), cents);
    add(byAsset, balance.token.symbol, cents);
  }

  let deployedCents = 0n;
  for (const position of input.positions) {
    if (position.status !== "open" && position.status !== "pending") continue;
    const cents = BigInt(Math.round((position.currentValueUsd ?? 0) * 100));
    deployedCents += cents;
    add(byChain, String(position.chainId), cents);
    add(byProtocol, position.protocol.slug, cents);
    add(byStrategy, position.strategyType, cents);

    const assetKey = positionAssetKey(position);
    add(byAsset, assetKey, cents);
  }

  return {
    totalUsdCents: availableCents + deployedCents,
    availableUsdCents: availableCents,
    byChain,
    byProtocol,
    byStrategy,
    byAsset,
  };
}

function positionAssetKey(position: PositionRow): string {
  if (Array.isArray(position.underlyingAssetIds)) {
    const first = position.underlyingAssetIds.find((value): value is string => typeof value === "string");
    if (first) return deriveAssetKey(first);
  }
  if (position.receiptToken?.symbol) {
    const derived = deriveAssetKey(position.receiptToken.symbol);
    if (derived !== "unknown") return derived;
  }
  return position.strategyType === "stablecoin_lp" ? "USDC" : "unclassified";
}
