import Link from "next/link";
import { ArrowRight, ChevronRight } from "lucide-react";
import { ProtocolIcon } from "@/components/ui/protocol-icon";
import { DataTag, Tag } from "@/components/ui/tag";
import { TokenOnChain } from "@/components/ui/token-stack";
import { formatUsd, formatUsdDelta } from "@/lib/format";
import { chainLabel } from "@/lib/opportunities/tabs";
import type { Holding } from "@/lib/portfolio/platform";
import { displayAmount } from "@/lib/ui/amount";
import { cn } from "@/lib/ui/cn";
import { timeAgo } from "@/lib/ui/time";

/** Cards shared by Home and Positions. Server components; every figure carries its provenance tag. */

export const STRATEGY_NAMES: Record<string, string> = {
  lending: "Lending",
  yield_vault: "Vault",
  stablecoin_lp: "Pool",
  arbitrage: "Arbitrage",
  tokenized_equity: "Stock",
};

export function SectionHead({ title, href, linkLabel = "See all" }: { title: string; href?: string; linkLabel?: string }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="type-h5 text-ink">{title}</h2>
      {href ? (
        <Link href={href} className="inline-flex items-center gap-1 text-[0.9375rem] text-ink-secondary hover:text-ink">
          {linkLabel}
          <ChevronRight className="size-4" strokeWidth={1.5} aria-hidden />
        </Link>
      ) : null}
    </div>
  );
}

export function HoldingCard({ holding }: { holding: Holding }) {
  return (
    <div className="card-tile flex-row items-center gap-3 p-4">
      <TokenOnChain symbol={holding.symbol} chainId={holding.chainId} size="lg" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-ink">{holding.symbol}</p>
        <p className="truncate text-sm text-ink-muted">{chainLabel(holding.chainId)}</p>
      </div>
      <div className="text-right">
        <p className="text-ink tabular-nums">{formatUsd(holding.valueUsd)}</p>
        <p className="text-sm text-ink-muted tabular-nums">{displayAmount(holding.amountAtomic, holding.decimals, 4)}</p>
      </div>
    </div>
  );
}

export type PositionCardData = {
  id: string;
  strategyType: string;
  chainId: number;
  positionReference: string;
  currentValueUsd: number | null;
  initialDepositUsd: number | null;
  unrealisedPnlUsd: number | null;
  status: string;
  dataMode: string;
  lastSyncedAt: Date | null;
  protocol: { name: string; slug: string };
};

export function positionTitle(position: Pick<PositionCardData, "positionReference" | "protocol" | "strategyType">) {
  const ref = position.positionReference;
  if (/^0x[a-fA-F0-9]{40}$/.test(ref)) return position.protocol.name;
  return ref.replace(/\s*\(simulated\)$/, "");
}

export function PositionCard({ position, now }: { position: PositionCardData; now: Date }) {
  const pnl = position.unrealisedPnlUsd;
  const closed = position.status === "closed";
  return (
    <Link href={`/positions/${position.id}`} className={cn("card-tile group p-5", closed && "opacity-60")}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <ProtocolIcon hints={[position.protocol.slug, position.protocol.name, position.positionReference]} label={position.protocol.name} />
          <div className="min-w-0">
            <p className="type-card-title truncate text-ink">{positionTitle(position)}</p>
            <p className="mt-0.5 truncate text-sm text-ink-muted">
              {position.protocol.name} · {chainLabel(position.chainId)}
            </p>
          </div>
        </div>
        <span className="flex shrink-0 items-center gap-1.5">
          {closed ? <Tag>Closed</Tag> : null}
          <DataTag dataMode={position.dataMode} />
        </span>
      </div>
      <div className="mt-5 flex items-end justify-between gap-3">
        <div>
          <p className="figure text-[1.75rem] leading-none text-ink">{formatUsd(position.currentValueUsd)}</p>
          <p className="mt-1.5 text-sm text-ink-muted">
            {STRATEGY_NAMES[position.strategyType] ?? position.strategyType}
            {pnl !== null && pnl !== 0 ? (
              <>
                {" · "}
                <span className={pnl > 0 ? "tone-up" : "tone-down"}>{formatUsdDelta(pnl)}</span>
              </>
            ) : null}
          </p>
        </div>
        <span className="flex items-center gap-1 text-sm text-ink-muted">
          {timeAgo(position.lastSyncedAt, now)}
          <ArrowRight className="size-4 transition-transform duration-150 group-hover:translate-x-0.5" strokeWidth={1.5} aria-hidden />
        </span>
      </div>
    </Link>
  );
}

export function PlanRow({
  plan,
  now,
}: {
  plan: { id: string; title: string; status: string; simulated: boolean; createdAt: Date; amountUsd: number | null; steps: { status: string }[] };
  now: Date;
}) {
  const done = plan.steps.filter((s) => s.status === "done").length;
  const tone = plan.status === "completed" ? "positive" : plan.status === "failed" ? "negative" : plan.status === "running" ? "info" : "neutral";
  const label: Record<string, string> = { draft: "Not approved", running: "In progress", completed: "Complete", failed: "Failed", cancelled: "Cancelled" };
  return (
    <Link href={`/plans/${plan.id}`} className="flex items-center gap-4 rounded-[var(--radius-panel)] px-3 py-3 transition-colors duration-100 hover:bg-surface">
      <div className="min-w-0 flex-1">
        <p className="truncate text-ink">{plan.title}</p>
        <p className="mt-0.5 text-sm text-ink-muted tabular-nums">
          {timeAgo(plan.createdAt, now)} · {done}/{plan.steps.length} steps
        </p>
      </div>
      <span className="hidden text-ink tabular-nums sm:block">{formatUsd(plan.amountUsd)}</span>
      <span className="flex shrink-0 items-center gap-1.5">
        {plan.simulated ? <Tag tone="sim">Simulated</Tag> : null}
        <Tag tone={tone}>{label[plan.status] ?? plan.status}</Tag>
      </span>
    </Link>
  );
}
