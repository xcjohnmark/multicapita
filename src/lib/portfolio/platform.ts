import type { Viewer } from "@/lib/auth/viewer";
import { getPrisma } from "@/lib/db/client";
import { applyPositionExits, applySimulatedLedger, lineValueUsd, type LedgerLine } from "@/lib/execution/plan/ledger";
import { readPreview } from "@/lib/execution/plan/preview";
import { readSimulationScope } from "@/lib/execution/plan/scope";
import { settleSimulatedPlans } from "@/lib/execution/plan/settle";
import { getPortfolioOverview } from "./queries";

/**
 * The portfolio as the platform shows it: the latest snapshot and positions, with this session's
 * simulated plans applied on top (debits from approval, credits and positions on completion,
 * exits on completion). Nothing here writes to the snapshot or to shared rows.
 */

export type Holding = LedgerLine & {
  /** Per-wallet split of the snapshot amount (before simulation). Live plans pay from one wallet. */
  wallets: { address: string; amountAtomic: bigint }[];
  valueUsd: number | null;
  dataMode: string;
  priceSource: string | null;
  observedAt: string | null;
};

const STRATEGY_LABELS: Record<string, string> = {
  yield_vault: "Vaults",
  lending: "Lending",
  stablecoin_lp: "Pools",
  arbitrage: "Arbitrage",
  tokenized_equity: "Stocks",
  cash: "Available",
};

export async function getPlatformPortfolio(viewer: Viewer) {
  const scope = await readSimulationScope(viewer);
  if (scope) await settleSimulatedPlans(viewer.userId, scope);

  const overview = await getPortfolioOverview(viewer.userId, { simulationScope: scope });
  if (!overview) return null;

  const plans = scope
    ? await getPrisma().executionPlan.findMany({
        where: { userId: viewer.userId, simulationKey: scope, simulated: true },
        select: { status: true, previewJson: true, positionId: true },
      })
    : [];

  const walletSplit = new Map<string, Map<string, bigint>>();
  for (const balance of overview.balances) {
    const key = `${balance.token.chainId}:${balance.token.contractAddress.toLowerCase()}`;
    const owner = balance.wallet?.address.toLowerCase() ?? "unknown";
    const split = walletSplit.get(key) ?? new Map<string, bigint>();
    split.set(owner, (split.get(owner) ?? 0n) + BigInt(balance.amountAtomic));
    walletSplit.set(key, split);
  }

  const baseLines: (LedgerLine & { meta: Omit<Holding, keyof LedgerLine | "valueUsd" | "wallets"> })[] = overview.balances.map(
    (balance) => ({
      chainId: balance.token.chainId,
      tokenAddress: balance.token.contractAddress.toLowerCase(),
      symbol: balance.token.symbol,
      decimals: balance.token.decimals,
      amountAtomic: BigInt(balance.amountAtomic),
      priceUsd: balance.priceUsd,
      meta: {
        dataMode: overview.dataMode,
        priceSource: balance.priceSource,
        observedAt: balance.priceObservedAt?.toISOString() ?? null,
      },
    }),
  );
  const metaByKey = new Map(baseLines.map((line) => [`${line.chainId}:${line.tokenAddress}`, line.meta]));

  const ledgerPlans = plans.map((plan) => {
    const preview = readPreview(plan.previewJson);
    return { status: plan.status, debit: preview?.ledger.debit ?? null, credit: preview?.ledger.credit ?? null };
  });
  const touched = ledgerPlans.some((plan) => plan.status !== "draft" && plan.status !== "cancelled" && plan.status !== "failed");

  const holdings: Holding[] = applySimulatedLedger(baseLines, ledgerPlans)
    .map((line) => {
      const meta = metaByKey.get(`${line.chainId}:${line.tokenAddress}`);
      const split = walletSplit.get(`${line.chainId}:${line.tokenAddress}`);
      return {
        ...line,
        wallets: split ? [...split.entries()].map(([address, amountAtomic]) => ({ address, amountAtomic })) : [],
        valueUsd: lineValueUsd(line),
        dataMode: meta?.dataMode ?? "dry_run",
        priceSource: meta?.priceSource ?? null,
        observedAt: meta?.observedAt ?? null,
      };
    })
    .filter((line) => line.amountAtomic > 0n)
    .sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0));

  const exits = plans.flatMap((plan) => {
    const preview = readPreview(plan.previewJson);
    return preview?.finalize?.kind === "exit"
      ? [{ positionId: preview.finalize.positionId, status: plan.status, amountUsd: preview.finalize.amountUsd, closes: preview.finalize.closes }]
      : [];
  });
  const positions = applyPositionExits(overview.positions, exits);
  const openPositions = positions.filter((p) => p.status === "open" || p.status === "pending");

  const availableUsd = holdings.reduce((sum, line) => sum + (line.valueUsd ?? 0), 0);
  const deployedUsd = openPositions.reduce((sum, p) => sum + (p.currentValueUsd ?? 0), 0);
  const totalUsd = availableUsd + deployedUsd;

  const byStrategyUsd: Record<string, number> = {};
  const byProtocolUsd: Record<string, number> = {};
  const byChainUsd: Record<number, number> = {};
  for (const p of openPositions) {
    byStrategyUsd[p.strategyType] = (byStrategyUsd[p.strategyType] ?? 0) + (p.currentValueUsd ?? 0);
    byProtocolUsd[p.protocol.slug] = (byProtocolUsd[p.protocol.slug] ?? 0) + (p.currentValueUsd ?? 0);
    byChainUsd[p.chainId] = (byChainUsd[p.chainId] ?? 0) + (p.currentValueUsd ?? 0);
  }
  for (const line of holdings) byChainUsd[line.chainId] = (byChainUsd[line.chainId] ?? 0) + (line.valueUsd ?? 0);

  const allocation = Object.entries({ ...byStrategyUsd, cash: availableUsd })
    .filter(([, value]) => value > 0)
    .map(([strategyType, valueUsd]) => ({
      strategyType,
      label: STRATEGY_LABELS[strategyType] ?? strategyType,
      valueUsd,
      weightPercent: totalUsd > 0 ? (valueUsd / totalUsd) * 100 : 0,
    }))
    .sort((a, b) => b.valueUsd - a.valueUsd);

  return {
    scope,
    simulatedActivity: touched,
    dataMode: overview.dataMode,
    observedAt: overview.observedAt?.toISOString() ?? null,
    holdings,
    positions,
    openPositions,
    totals: { totalUsd, availableUsd, deployedUsd },
    exposure: { totalUsd, availableUsd, byProtocolUsd, byChainUsd, byStrategyUsd },
    allocation,
    hasWallet: overview.balances.length > 0 || Boolean(overview.user.address),
  };
}

export type PlatformPortfolio = NonNullable<Awaited<ReturnType<typeof getPlatformPortfolio>>>;
