import { type Address } from "viem";
import { getPrisma } from "@/lib/db/client";
import { syncWalletPortfolio } from "./sync";

export type AllocationSlice = {
  strategyType: string;
  label: string;
  valueUsd: number;
  weightPercent: number;
};

const STRATEGY_LABELS: Record<string, string> = {
  yield_vault: "Yield vaults",
  lending: "Lending",
  stablecoin_lp: "Stablecoin LP",
  arbitrage: "Arbitrage",
  cash: "Available",
};

export async function getPortfolioOverview(userId: string) {
  const prisma = getPrisma();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, address: true },
  });
  if (!user) return null;

  let snapshot = await prisma.portfolioSnapshot.findFirst({
    where: { userId: user.id },
    orderBy: { snapshotAt: "desc" },
    include: {
      balances: {
        include: { token: true, wallet: true },
        orderBy: { valueUsd: "desc" },
      },
    },
  });

  // If the user has an on-chain address and no snapshot or a stale snapshot (> 60s),
  // trigger a fresh multi-chain live read from RPC.
  if (user.address && (!snapshot || Date.now() - snapshot.snapshotAt.getTime() > 60_000)) {
    try {
      snapshot = await syncWalletPortfolio(user.id, user.address as Address);
    } catch {
      // If live sync encounters RPC issues, fall back to existing snapshot without throwing
    }
  }

  const positions = await prisma.position.findMany({
    where: { userId: user.id },
    include: { protocol: true, receiptToken: true },
    orderBy: { currentValueUsd: "desc" },
  });

  const availableUsd = snapshot?.balances.reduce((sum, b) => sum + (b.valueUsd ?? 0), 0) ?? 0;
  const deployedUsd = positions
    .filter((p) => p.status === "open" || p.status === "pending")
    .reduce((sum, p) => sum + (p.currentValueUsd ?? 0), 0);
  const totalUsd = availableUsd + deployedUsd;

  const unrealisedPnlUsd = positions.reduce((sum, p) => sum + (p.unrealisedPnlUsd ?? 0), 0);
  const initialCapitalUsd = deployedUsd - unrealisedPnlUsd;
  const pnlPercent = initialCapitalUsd > 0 ? (unrealisedPnlUsd / initialCapitalUsd) * 100 : null;

  const byStrategy = new Map<string, number>();
  for (const position of positions) {
    if (position.status !== "open" && position.status !== "pending") continue;
    byStrategy.set(
      position.strategyType,
      (byStrategy.get(position.strategyType) ?? 0) + (position.currentValueUsd ?? 0),
    );
  }
  byStrategy.set("cash", availableUsd);

  const allocation: AllocationSlice[] = [...byStrategy.entries()]
    .map(([strategyType, valueUsd]) => ({
      strategyType,
      label: STRATEGY_LABELS[strategyType] ?? strategyType,
      valueUsd,
      weightPercent: totalUsd > 0 ? (valueUsd / totalUsd) * 100 : 0,
    }))
    .filter((slice) => slice.valueUsd > 0)
    .sort((a, b) => b.valueUsd - a.valueUsd);

  return {
    user,
    snapshot,
    balances: snapshot?.balances ?? [],
    positions,
    totals: {
      totalUsd,
      availableUsd,
      deployedUsd,
      unrealisedPnlUsd,
      pnlPercent,
    },
    allocation,
    dataMode: snapshot?.dataMode ?? "sample",
    observedAt: snapshot?.snapshotAt ?? null,
  };
}
