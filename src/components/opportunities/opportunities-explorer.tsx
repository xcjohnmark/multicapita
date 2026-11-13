"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { AssetIcon } from "@/components/ui/asset-icon";
import { ChainBadge, DataModeBanner, Panel, PanelHeader, StatusDot } from "@/components/ui/primitives";
import { SyncButton } from "@/components/ui/sync-button";
import { formatDateTime, formatPercent, formatUsd, formatUsdDelta } from "@/lib/format";

export type SerializedOpportunity = {
  id: string;
  strategyType: string;
  protocolName: string;
  chainId: number;
  tokenOrPairRef: string;
  marketOrPoolAddress: string | null;
  estimatedApy: number | null;
  rateType: string | null;
  tvlUsd: number | null;
  volume24hUsd: number | null;
  liquidityUsd: number | null;
  riskFlags: string[];
  expectedProfitUsd: number | null;
  /** Tokenized equities only: measured DEX-vs-reference spread, null when either price is missing. */
  navDeviationBps: number | null;
  dataMode: string;
  observedAtIso: string;
  status: string;
};

const STRATEGY_TABS = [
  { key: "all", label: "All" },
  { key: "lending", label: "Lending" },
  { key: "yield_vault", label: "Yield vaults" },
  { key: "stablecoin_lp", label: "Stablecoin LP" },
  { key: "arbitrage", label: "Arbitrage" },
  { key: "tokenized_equity", label: "Tokenized Equities" },
] as const;

const STRATEGY_GROUP_LABELS: Record<string, string> = {
  lending: "Lending markets",
  yield_vault: "Yield vaults",
  stablecoin_lp: "Stablecoin liquidity",
  arbitrage: "Cross-chain arbitrage",
  tokenized_equity: "Tokenized equities & RWAs",
};

const CHAIN_FILTERS = [
  { key: "all", label: "All chains" },
  { key: "8453", label: "Base" },
  { key: "42161", label: "Arbitrum" },
  { key: "1", label: "Ethereum" },
] as const;

export function OpportunitiesExplorer({
  opportunities,
}: {
  opportunities: SerializedOpportunity[];
}) {
  const [strategyTab, setStrategyTab] = useState<string>("all");
  const [chainFilter, setChainFilter] = useState<string>("all");
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return opportunities.filter((item) => {
      if (strategyTab !== "all" && item.strategyType !== strategyTab) return false;
      if (chainFilter !== "all" && String(item.chainId) !== chainFilter) return false;
      return true;
    });
  }, [opportunities, strategyTab, chainFilter]);

  const anySample = opportunities.some((o) => o.dataMode !== "live");
  const allLive = opportunities.length > 0 && !anySample;

  const groupsToRender = useMemo(() => {
    const keys =
      strategyTab === "all"
        ? (["lending", "yield_vault", "stablecoin_lp", "arbitrage", "tokenized_equity"] as const)
        : ([strategyTab] as const);
    return keys
      .map((key) => ({
        key,
        label: STRATEGY_GROUP_LABELS[key] ?? key,
        rows: filtered.filter((o) => o.strategyType === key),
      }))
      .filter((g) => g.rows.length > 0);
  }, [filtered, strategyTab]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">Discovery</p>
          <h1 className="mt-1 type-h4 text-ink">Opportunities</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
            Every opportunity carries its protocol, chain, asset identity, data source, and
            observation time. A displayed rate is research, not an executable quote.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2.5">
          {allLive ? (
            <span className="chip border-green-200 bg-green-50 text-accent-text">
              <StatusDot tone="ok" /> Live markets
            </span>
          ) : null}
          <SyncButton
            endpoint="/api/opportunities/sync"
            label="Sync markets"
            variant="secondary"
            onSynced={(payload) => {
              const res = payload as {
                data?: { syncedCount?: number; liveCount?: number };
              };
              const count = res.data?.liveCount ?? res.data?.syncedCount;
              setSyncNotice(
                typeof count === "number"
                  ? `Synced ${count} live market${count === 1 ? "" : "s"}.`
                  : "Markets synced.",
              );
            }}
          />
        </div>
      </header>

      {syncNotice ? (
        <div
          role="status"
          className="rounded-xl border border-green-200 bg-green-50/70 px-4 py-2.5 text-xs font-medium text-accent-text"
        >
          {syncNotice}
        </div>
      ) : null}

      {anySample ? (
        <DataModeBanner
          dataMode="sample"
          title="Staged Market Feed."
          message="Currently displaying verified staged markets. Click 'Sync markets' to fetch fresh live quotes from Aave V3, 1Click Earn, and DEX pools."
        />
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Strategy categories"
          className="flex flex-wrap items-center gap-1 rounded-xl border border-line bg-surface p-1"
        >
          {STRATEGY_TABS.map((tab) => {
            const active = strategyTab === tab.key;
            const count =
              tab.key === "all"
                ? opportunities.length
                : opportunities.filter((o) => o.strategyType === tab.key).length;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setStrategyTab(tab.key)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium tracking-tight transition-colors duration-100 ${
                  active
                    ? "bg-canvas text-ink shadow-[0_1px_2px_rgba(17,24,39,0.06)]"
                    : "text-ink-muted hover:text-ink"
                }`}
              >
                <span>{tab.label}</span>
                <span className="metric text-xs text-ink-faint">{count}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5">
          {CHAIN_FILTERS.map((chain) => {
            const active = chainFilter === chain.key;
            return (
              <button
                key={chain.key}
                type="button"
                aria-pressed={active}
                onClick={() => setChainFilter(chain.key)}
                className={`btn h-8 px-3 text-xs ${
                  active
                    ? "border-ink bg-ink text-ink-invert"
                    : "border-line bg-canvas text-ink-secondary hover:bg-surface"
                }`}
              >
                {chain.label}
              </button>
            );
          })}
        </div>
      </div>

      {groupsToRender.length === 0 ? (
        <Panel>
          <div className="px-5 py-12 text-center">
            {opportunities.length === 0 ? (
              <>
                <p className="type-card-title text-ink">No markets synced yet</p>
                <p className="mx-auto mt-1.5 max-w-md text-sm text-ink-muted">
                  Press Sync markets to read live rates from Aave V3, 1Click Earn vaults, DEX
                  pools and tokenized-stock issuers. Each row keeps its source and observation time.
                </p>
              </>
            ) : (
              <>
                <p className="type-card-title text-ink">No opportunities match this filter</p>
                <p className="mx-auto mt-1.5 max-w-md text-sm text-ink-muted">
                  Switch the strategy or chain filter, or press Sync markets to refresh.
                </p>
              </>
            )}
          </div>
        </Panel>
      ) : (
        groupsToRender.map((group) => {
          const groupLive = group.rows.every((r) => r.dataMode === "live");
          return (
            <Panel key={group.key}>
              <PanelHeader
                title={group.label}
                eyebrow={`${group.rows.length} candidate${group.rows.length === 1 ? "" : "s"}`}
                meta={
                  groupLive ? (
                    <span className="chip border-green-200 bg-green-50 text-accent-text">
                      <StatusDot tone="ok" /> Live
                    </span>
                  ) : (
                    <span className="chip border-line bg-surface text-ink-secondary">
                      <StatusDot tone="idle" /> Staged
                    </span>
                  )
                }
              />
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-sm">
                  <thead>
                    <tr className="border-b border-line bg-surface text-left">
                      <th className="eyebrow px-4 py-2.5">Market</th>
                      <th className="eyebrow px-4 py-2.5">Protocol</th>
                      <th className="eyebrow px-4 py-2.5">Chain</th>
                      <th className="eyebrow px-4 py-2.5 text-right">Rate</th>
                      <th className="eyebrow px-4 py-2.5 text-right">Liquidity</th>
                      <th className="eyebrow px-4 py-2.5">Risks & Flags</th>
                      <th className="eyebrow px-4 py-2.5 text-right">Observed</th>
                      <th className="eyebrow px-4 py-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-faint">
                    {group.rows.map((row) => {
                      const isArb = row.strategyType === "arbitrage";
                      const isEquity = row.strategyType === "tokenized_equity";
                      const hasProfit = row.expectedProfitUsd !== null;
                      const missingRate = !isArb && !isEquity && row.estimatedApy === null;

                      let actionHref = `/execute?direction=${
                        row.chainId === 42161 ? "base-to-arb" : "arb-to-base"
                      }&amount=100`;
                      let actionLabel = "Move funds";
                      if (row.strategyType === "lending") {
                        actionHref = `/execute?action=aave_supply&chainId=${row.chainId}&amount=10`;
                        actionLabel = "Supply Aave";
                      } else if (row.strategyType === "stablecoin_lp") {
                        actionHref = `/execute?action=uniswap_mint&chainId=${row.chainId}&amount=10`;
                        actionLabel = "Add LP";
                      } else if (isEquity) {
                        actionHref = row.marketOrPoolAddress
                          ? `/execute?action=equity_swap&chainId=${row.chainId}&contract=${row.marketOrPoolAddress}&amount=10`
                          : `/execute?action=equity_swap`;
                        actionLabel = "Buy / Sell";
                      } else if (isArb) {
                        actionLabel = "Execute Arb";
                      }

                      return (
                        <tr
                          key={row.id}
                          className="transition-colors duration-100 hover:bg-surface-hover"
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <AssetIcon symbolOrName={row.tokenOrPairRef.split(/[\s/-]/)[0] ?? row.tokenOrPairRef} size="md" />
                              <div className="min-w-[10rem]">
                                <p className="font-medium text-ink">{row.tokenOrPairRef}</p>
                                <p
                                  className="whitespace-nowrap font-mono text-xs text-ink-muted"
                                  title={row.marketOrPoolAddress ?? undefined}
                                >
                                  {row.marketOrPoolAddress
                                    ? `${row.marketOrPoolAddress.slice(0, 6)}…${row.marketOrPoolAddress.slice(-4)}`
                                    : "address pending verification"}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5 whitespace-nowrap text-ink-secondary">
                              <AssetIcon symbolOrName={row.protocolName} size="sm" />
                              <span>{row.protocolName}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <ChainBadge chainId={row.chainId} />
                          </td>
                          <td className="px-4 py-3 text-right metric" data-numeric>
                            <span
                              className={`font-medium ${
                                isArb && hasProfit && (row.expectedProfitUsd ?? 0) > 0
                                  ? "text-accent-text"
                                  : missingRate
                                    ? "text-ink-muted"
                                    : "text-ink"
                              }`}
                            >
                              {isArb && hasProfit
                                ? formatUsdDelta(row.expectedProfitUsd)
                                : isEquity
                                  ? row.navDeviationBps !== null
                                    ? `${row.navDeviationBps} bps`
                                    : "—"
                                  : formatPercent(row.estimatedApy)}
                            </span>
                            <span
                              className={`text-xs uppercase text-ink-muted ${
                                isEquity ? "block whitespace-nowrap" : "ml-1"
                              }`}
                            >
                              {isArb
                                ? "net est."
                                : isEquity
                                  ? row.navDeviationBps !== null
                                    ? "vs NAV"
                                    : "no DEX price"
                                  : (row.rateType ?? "")}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right metric text-ink-secondary" data-numeric>
                            {formatUsd(row.liquidityUsd ?? row.tvlUsd, { whole: true })}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex min-w-[11rem] flex-wrap gap-1">
                              {row.riskFlags.map((flag) => (
                                <span
                                  key={flag}
                                  className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-amber-200 bg-amber-50/80 px-1.5 py-0.5 text-xs font-medium text-amber-800"
                                >
                                  <AlertTriangle className="size-2.5" strokeWidth={1.5} aria-hidden />
                                  {flag.replaceAll("_", " ")}
                                </span>
                              ))}
                              {missingRate ? (
                                <span className="inline-flex items-center rounded-md border border-line bg-surface px-1.5 py-0.5 text-xs text-ink-muted">
                                  rate unverified
                                </span>
                              ) : null}
                              {row.riskFlags.length === 0 && !missingRate ? (
                                <span className="text-xs text-ink-faint">—</span>
                              ) : null}
                            </div>
                          </td>
                          <td className="min-w-[6.5rem] px-4 py-3 text-right text-xs leading-relaxed text-ink-muted">
                            {/* Date and time on their own lines instead of wrapping word by word. */}
                            {formatDateTime(row.observedAtIso)
                              .split(", ")
                              .map((part) => (
                                <span key={part} className="block whitespace-nowrap">
                                  {part}
                                </span>
                              ))}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Link
                              href={actionHref}
                              className="btn btn-secondary h-8 whitespace-nowrap px-2.5 text-xs"
                            >
                              <span>{actionLabel}</span>
                              <ArrowRight className="size-3.5" strokeWidth={1.5} aria-hidden />
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>
          );
        })
      )}
    </div>
  );
}
