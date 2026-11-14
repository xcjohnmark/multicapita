import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { ExitPanel } from "@/components/execution/exit-panel";
import { PlanRow, positionTitle, STRATEGY_NAMES } from "@/components/portfolio/cards";
import { ProtocolIcon } from "@/components/ui/protocol-icon";
import { DataTag, Tag } from "@/components/ui/tag";
import { getPrisma } from "@/lib/db/client";
import { isSimulatedFor } from "@/lib/execution/plan/scope";
import { resolveExitTarget } from "@/lib/execution/plan/targets";
import { parseDecimalToAtomic } from "@/lib/finance/amounts";
import { formatDateTime, formatPercent, formatUsd, formatUsdDelta } from "@/lib/format";
import { chainLabel, tabForStrategy } from "@/lib/opportunities/tabs";
import { getCurrentPortfolio, getCurrentViewer } from "@/lib/platform-context";
import { timeAgo } from "@/lib/ui/time";

export const dynamic = "force-dynamic";

export default async function PositionDetailPage({ params }: PageProps<"/positions/[id]">) {
  const { id } = await params;
  const [viewer, portfolio] = await Promise.all([getCurrentViewer(), getCurrentPortfolio()]);
  if (!viewer || !portfolio) notFound();
  const position = portfolio.positions.find((p) => p.id === id);
  if (!position) notFound();
  const now = new Date();

  const prisma = getPrisma();
  const [snapshot, plans, sameMarket] = await Promise.all([
    prisma.positionSnapshot.findFirst({ where: { positionId: id }, orderBy: { snapshotAt: "desc" } }),
    prisma.executionPlan.findMany({
      where: {
        userId: viewer.userId,
        positionId: id,
        status: { not: "draft" },
        ...(viewer.demo ? { simulationKey: portfolio.scope } : {}),
      },
      include: { steps: { select: { status: true } } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.opportunity.findFirst({
      where: { strategyType: position.strategyType, chainId: position.chainId, protocolId: position.protocolId, status: "active" },
      select: { id: true, strategyType: true },
    }),
  ]);

  const target = resolveExitTarget(position, "withdraw");
  const asset = "error" in target ? { symbol: "USDC", decimals: 6 } : { symbol: target.asset.symbol, decimals: target.asset.decimals };
  const underlying = position.underlyingAssetIds as { amountAtomic?: string; decimals?: number } | null;
  const recorded =
    underlying && !Array.isArray(underlying) && typeof underlying.amountAtomic === "string" && underlying.decimals === asset.decimals
      ? underlying.amountAtomic
      : null;
  let maxAtomic = recorded ?? "0";
  if (!recorded && asset.symbol === "USDC" && position.currentValueUsd) {
    try {
      // Sample positions have no recorded amount: their USD value stands in for USDC, demo only.
      maxAtomic = parseDecimalToAtomic(position.currentValueUsd.toFixed(6), 6).toString();
    } catch {
      maxAtomic = "0";
    }
  }
  const pnl = position.unrealisedPnlUsd;

  return (
    <div className="space-y-8">
      <Link href="/positions" className="inline-flex items-center gap-2 text-[0.9375rem] text-ink-muted hover:text-ink">
        <ArrowLeft className="size-4" strokeWidth={1.5} aria-hidden />
        Positions
      </Link>

      <header className="flex flex-wrap items-center gap-4">
        <ProtocolIcon
          hints={[position.protocol.slug, position.protocol.name, position.positionReference]}
          label={position.protocol.name}
          size="xl"
        />
        <div className="min-w-0 flex-1">
          <h1 className="type-h3 text-balance text-ink">{positionTitle(position)}</h1>
          <p className="mt-1 text-ink-muted">
            {position.protocol.name} · {chainLabel(position.chainId)} · {STRATEGY_NAMES[position.strategyType] ?? position.strategyType}
          </p>
        </div>
        <span className="flex gap-2">
          {position.status === "closed" ? <Tag>Closed</Tag> : null}
          <DataTag dataMode={position.dataMode} />
        </span>
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start">
        <section aria-label="Metrics" className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:col-start-1 lg:row-start-1">
          <Tile label="Value" value={formatUsd(position.currentValueUsd)} strong />
          <Tile label="Deposited" value={formatUsd(position.initialDepositUsd)} />
          <Tile
            label="P&L"
            value={<span className={pnl && pnl > 0 ? "tone-up" : pnl && pnl < 0 ? "tone-down" : ""}>{formatUsdDelta(pnl)}</span>}
          />
          <Tile label={snapshot?.rateType ?? "Rate"} value={formatPercent(snapshot?.rateValue ?? null)} />
        </section>
        <aside aria-label="Manage" className="card-tile p-5 lg:sticky lg:top-24 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <h2 className="type-h6 mb-4 text-ink">Manage</h2>
          {"error" in target ? (
            <p className="text-pretty text-ink-muted">{target.error}</p>
          ) : (
            <ExitPanel
              positionId={position.id}
              chainId={position.chainId}
              asset={asset}
              maxAtomic={maxAtomic}
              canCollect={position.strategyType === "stablecoin_lp"}
              addHref={sameMarket ? `/opportunities/${tabForStrategy(sameMarket.strategyType)}/${sameMarket.id}` : null}
              simulated={isSimulatedFor(viewer)}
              closed={position.status === "closed"}
            />
          )}
        </aside>
        <div className="space-y-8 lg:col-start-1 lg:row-start-2">

          <section className="card-tile divide-y divide-line">
            <Row label="Opened">{formatDateTime(position.openedAt)}</Row>
            <Row label="Last read">{position.lastSyncedAt ? timeAgo(position.lastSyncedAt, now) : "—"}</Row>
            <Row label="Reference">
              <span className="font-mono text-sm break-all">{position.positionReference}</span>
            </Row>
            <Row label="Source">
              {position.dataMode === "dry_run"
                ? "Created by a simulated plan"
                : position.dataMode === "sample"
                  ? "Sample fixture"
                  : "Reconciled on-chain"}
            </Row>
          </section>

          {plans.length ? (
            <section>
              <h2 className="type-h5 mb-3 text-ink">History</h2>
              <div className="card-tile p-2">
                {plans.map((plan) => (
                  <PlanRow key={plan.id} plan={plan} now={now} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value, strong }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <div className="rounded-[var(--radius-panel)] bg-surface p-4">
      <p className="text-sm text-ink-muted">{label}</p>
      <div className={`figure mt-1.5 truncate text-ink ${strong ? "text-2xl leading-8" : "text-xl leading-7"}`}>{value}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 px-5 py-4 text-[0.9375rem] sm:flex-row sm:justify-between sm:gap-6">
      <span className="shrink-0 text-ink-muted">{label}</span>
      <span className="text-ink-secondary sm:text-right">{children}</span>
    </div>
  );
}
