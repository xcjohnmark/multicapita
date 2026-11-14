import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { Identicon } from "@/components/ui/identicon";
import { DataTag, Tag } from "@/components/ui/tag";
import { TokenStack } from "@/components/ui/token-stack";
import { traderName, type TraderCard as Trader } from "@/lib/copytrading/traders";
import { formatPercent, formatUsdDelta } from "@/lib/format";

export function TraderCard({ trader }: { trader: Trader }) {
  const symbols = [...new Set(trader.positions.map((p) => p.symbol))].slice(0, 4);
  return (
    <article className="card-tile p-5">
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Identicon seed={trader.address} size={48} />
          <div className="min-w-0">
            <h3 className="type-card-title truncate text-ink">{traderName(trader)}</h3>
            <p className="mt-0.5 truncate text-sm text-ink-muted">{trader.resolvedHandle ?? trader.primaryStyle}</p>
          </div>
        </div>
        <DataTag dataMode={trader.dataMode} />
      </header>

      <div className="mt-6">
        <p className={`figure text-[2rem] leading-none ${trader.realisedPnl90dUsd !== null && trader.realisedPnl90dUsd < 0 ? "tone-down" : "text-ink"}`}>
          {formatUsdDelta(trader.realisedPnl90dUsd)}
        </p>
        <p className="mt-1.5 text-sm text-ink-muted">Realised P&amp;L, 90d</p>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4 text-sm">
        <div>
          <dt className="text-ink-muted">Win rate</dt>
          <dd className="mt-0.5 text-ink tabular-nums">{formatPercent(trader.winRatePercent, 0)}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Max drawdown</dt>
          <dd className="mt-0.5 text-ink tabular-nums">{formatPercent(trader.maxDrawdownPercent, 1)}</dd>
        </div>
      </dl>

      <footer className="mt-5 flex items-center justify-between gap-3">
        <span className="flex items-center gap-2">
          {symbols.length > 0 ? <TokenStack symbols={symbols} size="sm" /> : null}
          <Tag>{trader.primaryStyle}</Tag>
        </span>
        <Link
          href={`/opportunities/copytrading/${encodeURIComponent(trader.address)}`}
          className={buttonClass("primary", "md", "h-10 px-4")}
          aria-label={`Explore ${traderName(trader)}`}
        >
          Explore
          <ArrowRight className="size-4" strokeWidth={1.75} aria-hidden />
        </Link>
      </footer>
    </article>
  );
}
