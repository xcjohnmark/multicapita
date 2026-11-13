import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { AssetIcon } from "@/components/ui/asset-icon";
import {
  ChainBadge,
  DataModeBanner,
  EmptyState,
  Metric,
  Panel,
  PanelHeader,
  StatusDot,
} from "@/components/ui/primitives";
import { SyncButton } from "@/components/ui/sync-button";
import { LinkedWalletsPanel } from "@/components/wallet/linked-wallets";
import { getViewer } from "@/lib/auth/viewer";
import { getPrisma } from "@/lib/db/client";
import {
  formatBps,
  formatDateTime,
  formatPercent,
  formatUsd,
  formatUsdDelta,
  shortenMiddle,
} from "@/lib/format";
import { getRoutePreview } from "@/lib/near/route-preview";
import { getPortfolioOverview } from "@/lib/portfolio/queries";
import { runPortfolioHealthCheck } from "@/lib/portfolio/monitoring";

export const dynamic = "force-dynamic";

const STRATEGY_TONE: Record<string, string> = {
  cash: "bg-ink-faint/50",
  lending: "bg-accent",
  stablecoin_lp: "bg-info",
  yield_vault: "bg-warn",
  arbitrage: "bg-danger",
  tokenized_equity: "bg-indigo-500",
  copytrading: "bg-emerald-500",
};

export default async function OverviewPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/signin");

  const prisma = getPrisma();
  const [portfolio, preview, health, wallets] = await Promise.all([
    getPortfolioOverview(viewer.userId),
    getRoutePreview(),
    runPortfolioHealthCheck(viewer.userId),
    prisma.wallet.findMany({
      where: { userId: viewer.userId },
      orderBy: [{ ownershipVerifiedAt: "desc" }, { chainId: "asc" }],
      select: {
        id: true,
        address: true,
        chainFamily: true,
        chainId: true,
        label: true,
        ownershipVerifiedAt: true,
      },
    }),
  ]);

  const linkedWallets = wallets.map((w) => ({
    ...w,
    ownershipVerifiedAt: w.ownershipVerifiedAt ? w.ownershipVerifiedAt.toISOString() : null,
  }));

  if (!portfolio || !portfolio.snapshot) {
    return (
      <div className="space-y-6">
        <Panel>
          <PanelHeader title="Portfolio" eyebrow="Overview" />
          <EmptyState
            title="No portfolio snapshot yet"
            description="Seed the local demo portfolio to explore the product, or connect a wallet to sync live balances. Nothing here is live until it says so."
            action={
              !viewer.demo ? (
                <SyncButton endpoint="/api/portfolio/sync" label="Sync wallet balances" variant="primary" />
              ) : (
                <code className="rounded-lg border border-line bg-surface px-3 py-2 font-mono text-xs text-ink-secondary">
                  npm run db:seed
                </code>
              )
            }
          />
        </Panel>
        <LinkedWalletsPanel initialWallets={linkedWallets} />
      </div>
    );
  }

  const { totals, positions, balances, allocation, observedAt, dataMode } = portfolio;
  // Every tracked token is read on every chain, so most rows are zero. Show what is held.
  const heldBalances = balances.filter((item) => item.amountDisplay > 0);
  const emptyBalanceCount = balances.length - heldBalances.length;

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">Portfolio</p>
          <h1 className="mt-1 type-h4 text-ink">
            Cross-chain overview
          </h1>
        </div>
        <div className="flex items-end gap-2.5">
          <div className="flex flex-col items-start gap-1 sm:items-end">
            <div className="flex items-center gap-2">
              <span
                className={`chip ${
                  health.status === "healthy"
                    ? "border-green-200 bg-green-50 text-accent-text"
                    : health.status === "warning"
                      ? "border-amber-200 bg-amber-50 text-amber-800"
                      : "border-red-200 bg-red-50 text-danger-text"
                }`}
              >
                <StatusDot tone={health.status === "healthy" ? "ok" : health.status === "warning" ? "warn" : "error"} />
                {health.status === "healthy" ? "Positions Healthy" : health.status === "warning" ? "Risk Warning" : "Health Alert"}
              </span>
              <span
                className={`chip ${
                  dataMode === "live"
                    ? "border-green-200 bg-green-50 text-accent-text"
                    : "border-amber-200 bg-amber-50 text-amber-800"
                }`}
              >
                <StatusDot tone={dataMode === "live" ? "ok" : "warn"} />
                {dataMode === "live" ? "Live balances" : "Sample balances"}
              </span>
            </div>
            <p className="text-xs text-ink-muted">
              Balances observed {formatDateTime(observedAt)} · valuations are point-in-time
              {viewer.demo ? " · test session" : ""}
            </p>
          </div>
          {!viewer.demo ? (
            <SyncButton
              endpoint="/api/portfolio/sync"
              label="Sync live balances"
              iconOnly
              variant="secondary"
            />
          ) : null}
        </div>
      </header>

      {health.alerts.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50/90 p-4 text-xs text-amber-900 space-y-1.5">
          <p className="font-medium flex items-center gap-1.5">
            <StatusDot tone="warn" /> Continuous Monitoring Alert:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            {health.alerts.map((alert, i) => (
              <li key={i}>{alert.message}</li>
            ))}
          </ul>
        </div>
      )}

      <DataModeBanner
        dataMode={dataMode}
        title="Sandbox Testing Environment."
        message="Simulated transaction testing mode. Real wallet signatures and live 1Click quote validations are enforced before any real execution."
      />

      <Panel>
        <div className="grid grid-cols-2 divide-line lg:grid-cols-4 lg:divide-x">
          <Metric
            label="Total value"
            value={formatUsd(totals.totalUsd)}
            sub={`${positions.length} open position${positions.length === 1 ? "" : "s"}`}
          />
          <Metric
            label="Deployed"
            value={formatUsd(totals.deployedUsd)}
            sub="Working in strategies"
          />
          <Metric
            label="Available"
            value={formatUsd(totals.availableUsd)}
            sub="Undeployed wallet balance"
          />
          <Metric
            label="Unrealised P&L"
            // Without a cost basis there is no P&L to report; "$0.00" would claim break-even.
            value={totals.pnlPercent === null ? "—" : formatUsdDelta(totals.unrealisedPnlUsd)}
            sub={
              totals.pnlPercent === null
                ? "No cost basis recorded yet"
                : `${formatPercent(totals.pnlPercent)} on deployed capital`
            }
            tone={
              totals.pnlPercent === null
                ? "default"
                : totals.unrealisedPnlUsd >= 0
                  ? "positive"
                  : "negative"
            }
          />
        </div>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-5">
        <Panel className="lg:col-span-3">
          <PanelHeader
            title="Allocation"
            eyebrow="By strategy"
            meta={<span className="chip metric">{formatUsd(totals.totalUsd, { whole: true })}</span>}
          />
          {allocation.length === 0 ? (
            <EmptyState
              title="Nothing allocated yet"
              description="Allocation appears once the portfolio holds priced balances or open positions. Ask for a strategy to see where capital could go."
              action={
                <Link href="/strategy" className="btn btn-secondary h-9 px-3.5 text-sm">
                  <span>Plan a strategy</span>
                  <ArrowRight className="size-3.5" strokeWidth={1.5} aria-hidden />
                </Link>
              }
            />
          ) : (
          <>
          <div className="px-5 pt-4">
            <div
              className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-surface-raised"
              role="img"
              aria-label="Allocation by strategy"
            >
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
          <div className="px-5 pb-3 pt-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th className="eyebrow pb-2">Strategy</th>
                  <th className="eyebrow pb-2 text-right">Value</th>
                  <th className="eyebrow pb-2 text-right">Weight</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-faint">
                {allocation.map((slice) => (
                  <tr key={slice.strategyType}>
                    <td className="py-2.5">
                      <span className="flex items-center gap-2">
                        <span
                          className={`size-2 rounded-sm ${STRATEGY_TONE[slice.strategyType] ?? "bg-ink-faint"}`}
                          aria-hidden
                        />
                        <span className="font-medium text-ink">{slice.label}</span>
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
          </>
          )}
        </Panel>

        <Panel className="lg:col-span-2">
          <PanelHeader
            title="NEAR Intents route"
            eyebrow="Live quote · dry run"
            meta={
              preview.ok ? (
                <span className="chip border-green-200 bg-green-50 text-accent-text">
                  <StatusDot tone="ok" /> 1Click
                </span>
              ) : (
                <span className="chip border-red-200 bg-red-50 text-danger-text">
                  <StatusDot tone="error" /> Unavailable
                </span>
              )
            }
          />
          {preview.ok ? (
            <div className="space-y-4 px-5 py-4">
              <div className="flex items-center justify-between rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm">
                <div>
                  <p className="font-medium text-ink">Base · USDC</p>
                  <p className="metric text-xs text-ink-muted">100.000000</p>
                </div>
                <ArrowRight className="size-4 text-ink-muted" strokeWidth={1.5} aria-hidden />
                <div className="text-right">
                  <p className="font-medium text-ink">Arbitrum · USDC</p>
                  <p className="metric text-xs text-ink-muted">
                    {formatAtomicForDisplay(preview.quotedOutputAtomic)}
                  </p>
                </div>
              </div>

              <dl className="space-y-2 border-t border-line pt-3 text-xs">
                <Row label="Implied cost" value={formatBps(preview.impliedCostBps)} />
                <Row
                  label="Protected minimum"
                  value={formatAtomicForDisplay(preview.minimumOutputAtomic)}
                />
                <Row
                  label="Est. settlement"
                  value={preview.timeEstimateSeconds ? `${preview.timeEstimateSeconds}s` : "—"}
                />
                <Row label="Quoted at" value={formatDateTime(preview.quotedAt)} />
                <Row
                  label="Correlation"
                  value={
                    <span className="font-mono">{shortenMiddle(preview.correlationId, 8, 4)}</span>
                  }
                />
              </dl>

              <div className="pt-1">
                <Link
                  href="/execute?direction=base-to-arb&amount=100"
                  className="btn btn-secondary w-full justify-center text-xs"
                >
                  <span>Execute route in Console</span>
                  <ArrowRight className="size-3.5" strokeWidth={1.5} aria-hidden />
                </Link>
              </div>

              <p className="text-xs leading-relaxed text-ink-muted">{preview.note}</p>
            </div>
          ) : (
            <div className="px-5 py-5">
              <p className="text-sm font-medium text-ink">Route temporarily unavailable</p>
              <p className="mt-1 text-xs text-ink-muted">{preview.error}</p>
              {preview.correlationId ? (
                <p className="mt-2 font-mono text-xs text-ink-faint">{preview.correlationId}</p>
              ) : null}
            </div>
          )}
        </Panel>
      </div>

      {balances.length > 0 ? (
        <Panel>
          <PanelHeader
            title="Wallet balances"
            eyebrow="Liquid assets"
            meta={
              <span className="chip">
                {heldBalances.length} held
                {emptyBalanceCount > 0 ? ` · ${emptyBalanceCount} empty hidden` : ""}
              </span>
            }
          />
          {heldBalances.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-ink-muted">
              Every tracked token reads zero on Base and Arbitrum for the linked wallets.
            </p>
          ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-line bg-surface text-left">
                  <th className="eyebrow px-5 py-2.5">Asset</th>
                  <th className="eyebrow px-5 py-2.5">Chain</th>
                  <th className="eyebrow px-5 py-2.5 text-right">Balance</th>
                  <th className="eyebrow px-5 py-2.5 text-right">USD Value</th>
                  <th className="eyebrow px-5 py-2.5 text-right">Price Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-faint">
                {heldBalances.map((item) => (
                  <tr
                    key={item.id}
                    className="transition-colors duration-100 hover:bg-surface-hover"
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <AssetIcon symbolOrName={item.token.symbol} size="md" />
                        <div>
                          <p className="font-medium text-ink">{item.token.symbol}</p>
                          <p className="font-mono text-xs text-ink-muted">
                            {shortenMiddle(item.token.contractAddress, 8, 6)}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <ChainBadge chainId={item.token.chainId} />
                    </td>
                    <td className="px-5 py-3 text-right metric text-ink" data-numeric>
                      {item.amountDisplay.toFixed(item.token.decimals > 6 ? 4 : 2)}
                    </td>
                    <td className="px-5 py-3 text-right metric font-medium text-ink" data-numeric>
                      {item.valueUsd !== null && item.priceSource !== "unpriced" ? (
                        formatUsd(item.valueUsd)
                      ) : (
                        <span className="font-normal text-ink-muted">Unpriced</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right text-xs text-ink-muted">
                      {item.priceSource ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </Panel>
      ) : null}

      <Panel>
        <PanelHeader
          title="Open positions"
          eyebrow="Deployed capital"
          action={
            <Link
              href="/positions"
              className="btn btn-ghost h-8 px-2.5 text-xs text-ink-secondary"
            >
              <span>Manage</span>
              <ArrowRight className="size-3.5" strokeWidth={1.5} aria-hidden />
            </Link>
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line bg-surface text-left">
                <th className="eyebrow px-5 py-2.5">Position</th>
                <th className="eyebrow px-5 py-2.5">Protocol</th>
                <th className="eyebrow px-5 py-2.5">Chain</th>
                <th className="eyebrow px-5 py-2.5 text-right">Value</th>
                <th className="eyebrow px-5 py-2.5 text-right">Accrued</th>
                <th className="eyebrow px-5 py-2.5 text-right">Unrealised</th>
                <th className="eyebrow px-5 py-2.5 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-faint">
              {positions.map((position) => (
                <tr key={position.id} className="transition-colors duration-100 hover:bg-surface-hover">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <AssetIcon symbolOrName={position.protocol.name} size="md" />
                      <div>
                        <p className="font-medium text-ink">{position.positionReference}</p>
                        <p className="text-xs text-ink-muted">
                          {position.strategyType.replaceAll("_", " ")}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-ink-secondary">{position.protocol.name}</td>
                  <td className="px-5 py-3">
                    <ChainBadge chainId={position.chainId} />
                  </td>
                  <td className="px-5 py-3 text-right metric text-ink" data-numeric>
                    {formatUsd(position.currentValueUsd)}
                  </td>
                  <td className="px-5 py-3 text-right metric text-ink-secondary" data-numeric>
                    {formatUsdDelta(position.accruedReturnUsd)}
                  </td>
                  <td
                    className={`px-5 py-3 text-right metric font-medium ${
                      (position.unrealisedPnlUsd ?? 0) >= 0
                        ? "text-accent-text"
                        : "text-danger-text"
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
                  <td colSpan={7} className="px-5 py-8 text-center text-sm text-ink-muted">
                    No open positions.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>

      <LinkedWalletsPanel initialWallets={linkedWallets} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-ink-muted">{label}</dt>
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
