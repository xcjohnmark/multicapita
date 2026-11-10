import Link from "next/link";
import type { ReactNode } from "react";
import { EmptyState, Metric, Panel, PanelHeader, StatusDot } from "@/components/ui/primitives";
import { formatBps, formatDateTime, formatPercent, formatUsd, formatUsdDelta, shortenMiddle } from "@/lib/format";
import { getRoutePreview } from "@/lib/near/route-preview";
import { getPortfolioOverview } from "@/lib/portfolio/queries";

export const dynamic = "force-dynamic";

const STRATEGY_TONE: Record<string, string> = {
  cash: "bg-ink-faint/40",
  lending: "bg-accent",
  stablecoin_lp: "bg-info",
  yield_vault: "bg-warn",
  arbitrage: "bg-danger",
};

export default async function OverviewPage() {
  const [portfolio, preview] = await Promise.all([getPortfolioOverview(), getRoutePreview()]);

  if (!portfolio || !portfolio.snapshot) {
    return (
      <Panel>
        <PanelHeader title="Portfolio" eyebrow="Overview" />
        <EmptyState
          title="No portfolio snapshot yet"
          description="Seed the local demo portfolio to explore the product, or connect a wallet once wallet support lands. Nothing in this screen is live until it says so."
          action={
            <code className="rounded-md border border-line bg-surface-raised px-3 py-2 text-xs text-ink-muted">
              npm run db:seed
            </code>
          }
        />
      </Panel>
    );
  }

  const { totals, positions, allocation, observedAt, dataMode } = portfolio;

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">Portfolio</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Cross-chain overview</h1>
        </div>
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <span className="chip">
            <StatusDot tone={dataMode === "live" ? "ok" : "warn"} />
            {dataMode === "live" ? "Live balances" : "Sample portfolio"}
          </span>
          <p className="text-xs text-ink-faint">
            Balances observed {formatDateTime(observedAt)} · valuations are point-in-time
          </p>
        </div>
      </header>

      {dataMode !== "live" ? (
        <div className="rounded-panel border border-warn/30 bg-warn/[0.06] px-4 py-3">
          <p className="text-sm text-ink">
            <span className="font-semibold text-warn">Demo mode.</span> Portfolio figures come from
            a labelled local fixture, not a wallet or chain. The route card below is a live,
            non-executable 1Click quote.
          </p>
        </div>
      ) : null}

      <Panel>
        <div className="grid grid-cols-2 divide-line lg:grid-cols-4 lg:divide-x">
          <Metric
            label="Total value"
            value={formatUsd(totals.totalUsd)}
            sub={`${positions.length} open position${positions.length === 1 ? "" : "s"}`}
          />
          <Metric label="Deployed" value={formatUsd(totals.deployedUsd)} sub="Working in strategies" />
          <Metric label="Available" value={formatUsd(totals.availableUsd)} sub="Undeployed wallet balance" />
          <Metric
            label="Unrealised P&L"
            value={formatUsdDelta(totals.unrealisedPnlUsd)}
            sub={totals.pnlPercent === null ? "Cost basis unavailable" : `${formatPercent(totals.pnlPercent)} on deployed capital`}
            tone={totals.unrealisedPnlUsd >= 0 ? "positive" : "negative"}
          />
        </div>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-5">
        <Panel className="lg:col-span-3">
          <PanelHeader
            title="Allocation"
            eyebrow="By strategy"
            meta={<span className="chip">{formatUsd(totals.totalUsd, { whole: true })}</span>}
          />
          <div className="px-5 pt-4">
            <div className="flex h-2 w-full overflow-hidden rounded-full bg-surface-raised" role="img" aria-label="Allocation by strategy">
              {allocation.map((slice) => (
                <div
                  key={slice.strategyType}
                  className={STRATEGY_TONE[slice.strategyType] ?? "bg-ink-faint"}
                  style={{ width: `${slice.weightPercent}%` }}
                  title={`${slice.label}: ${slice.weightPercent.toFixed(1)}%`}
                />
              ))}
            </div>
          </div>
          <div className="px-5 pb-2 pt-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th className="pb-2 text-xs font-medium text-ink-faint">Strategy</th>
                  <th className="pb-2 text-right text-xs font-medium text-ink-faint">Value</th>
                  <th className="pb-2 text-right text-xs font-medium text-ink-faint">Weight</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {allocation.map((slice) => (
                  <tr key={slice.strategyType}>
                    <td className="py-2.5">
                      <span className="flex items-center gap-2">
                        <span
                          className={`size-2 rounded-sm ${STRATEGY_TONE[slice.strategyType] ?? "bg-ink-faint"}`}
                          aria-hidden
                        />
                        <span className="text-ink">{slice.label}</span>
                      </span>
                    </td>
                    <td className="py-2.5 text-right metric text-ink" data-numeric>
                      {formatUsd(slice.valueUsd)}
                    </td>
                    <td className="py-2.5 text-right metric text-ink-muted" data-numeric>
                      {formatPercent(slice.weightPercent, 1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel className="lg:col-span-2">
          <PanelHeader
            title="NEAR Intents route"
            eyebrow="Live quote · dry run"
            meta={
              preview.ok ? (
                <span className="chip border-accent/30 text-accent">
                  <StatusDot tone="ok" /> 1Click
                </span>
              ) : (
                <span className="chip border-danger/30 text-danger">
                  <StatusDot tone="error" /> Unavailable
                </span>
              )
            }
          />
          {preview.ok ? (
            <div className="space-y-4 px-5 py-4">
              <div className="flex items-center justify-between text-sm">
                <div>
                  <p className="text-ink">Base · USDC</p>
                  <p className="metric text-xs text-ink-faint">100.000000</p>
                </div>
                <span className="text-ink-faint" aria-hidden>
                  →
                </span>
                <div className="text-right">
                  <p className="text-ink">Arbitrum · USDC</p>
                  <p className="metric text-xs text-ink-faint">
                    {formatAtomicForDisplay(preview.quotedOutputAtomic)}
                  </p>
                </div>
              </div>

              <dl className="space-y-2 border-t border-line pt-3 text-xs">
                <Row label="Implied cost" value={formatBps(preview.impliedCostBps)} />
                <Row label="Protected minimum" value={formatAtomicForDisplay(preview.minimumOutputAtomic)} />
                <Row label="Est. settlement" value={preview.timeEstimateSeconds ? `${preview.timeEstimateSeconds}s` : "—"} />
                <Row label="Quoted at" value={formatDateTime(preview.quotedAt)} />
                <Row
                  label="Correlation"
                  value={<span className="font-mono">{shortenMiddle(preview.correlationId, 8, 4)}</span>}
                />
              </dl>

              <p className="text-[11px] leading-relaxed text-ink-faint">{preview.note}</p>
            </div>
          ) : (
            <div className="px-5 py-5">
              <p className="text-sm text-ink">Route temporarily unavailable</p>
              <p className="mt-1 text-xs text-ink-muted">{preview.error}</p>
              {preview.correlationId ? (
                <p className="mt-2 font-mono text-[11px] text-ink-faint">{preview.correlationId}</p>
              ) : null}
            </div>
          )}
        </Panel>
      </div>

      <Panel>
        <PanelHeader
          title="Open positions"
          eyebrow="Deployed capital"
          action={
            <Link href="/positions" className="text-xs text-ink-muted underline-offset-4 hover:text-ink hover:underline">
              Manage
            </Link>
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="px-5 py-2.5 text-xs font-medium text-ink-faint">Position</th>
                <th className="px-5 py-2.5 text-xs font-medium text-ink-faint">Protocol</th>
                <th className="px-5 py-2.5 text-right text-xs font-medium text-ink-faint">Value</th>
                <th className="px-5 py-2.5 text-right text-xs font-medium text-ink-faint">Accrued</th>
                <th className="px-5 py-2.5 text-right text-xs font-medium text-ink-faint">Unrealised</th>
                <th className="px-5 py-2.5 text-right text-xs font-medium text-ink-faint">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {positions.map((position) => (
                <tr key={position.id} className="hover:bg-surface-raised/40">
                  <td className="px-5 py-3">
                    <p className="text-ink">{position.positionReference}</p>
                    <p className="text-xs text-ink-faint">{position.strategyType.replaceAll("_", " ")}</p>
                  </td>
                  <td className="px-5 py-3 text-ink-muted">{position.protocol.name}</td>
                  <td className="px-5 py-3 text-right metric" data-numeric>
                    {formatUsd(position.currentValueUsd)}
                  </td>
                  <td className="px-5 py-3 text-right metric text-ink-muted" data-numeric>
                    {formatUsdDelta(position.accruedReturnUsd)}
                  </td>
                  <td
                    className={`px-5 py-3 text-right metric ${
                      (position.unrealisedPnlUsd ?? 0) >= 0 ? "text-accent" : "text-danger"
                    }`}
                    data-numeric
                  >
                    {formatUsdDelta(position.unrealisedPnlUsd)}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <span className="chip capitalize">{position.status}</span>
                  </td>
                </tr>
              ))}
              {positions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-sm text-ink-muted">
                    No open positions.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-ink-faint">{label}</dt>
      <dd className="metric text-ink" data-numeric>
        {value}
      </dd>
    </div>
  );
}

/** 6-decimal USDC display for route amounts. Kept local until token metadata is threaded through. */
function formatAtomicForDisplay(atomic: string | null): string {
  if (!atomic) return "—";
  const value = BigInt(atomic);
  const whole = value / 1_000_000n;
  const fraction = (value % 1_000_000n).toString().padStart(6, "0");
  return `${whole}.${fraction}`;
}
