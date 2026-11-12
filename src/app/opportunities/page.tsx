import Link from "next/link";
import { Panel, PanelHeader, StatusDot } from "@/components/ui/primitives";
import { getPrisma } from "@/lib/db/client";
import { formatDateTime, formatPercent, formatUsd, formatUsdDelta } from "@/lib/format";

export const dynamic = "force-dynamic";

const STRATEGY_ORDER = [
  { key: "lending", label: "Lending markets" },
  { key: "yield_vault", label: "Yield vaults" },
  { key: "stablecoin_lp", label: "Stablecoin liquidity" },
  { key: "arbitrage", label: "Cross-chain arbitrage" },
] as const;

export default async function OpportunitiesPage() {
  const opportunities = await getPrisma().opportunity.findMany({
    include: { protocol: true },
    orderBy: [{ strategyType: "asc" }, { estimatedApy: "desc" }],
  });

  const anySample = opportunities.some((o) => o.dataMode !== "live");

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Discovery</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Opportunities</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Every opportunity carries its protocol, chain, asset identity, data source and observation
          time. A displayed rate is not an executable quote.
        </p>
      </header>

      {anySample ? (
        <div className="rounded-panel border border-warn/30 bg-warn/[0.06] px-4 py-3 text-sm">
          <span className="font-semibold text-warn">Fixture data.</span> These opportunities are
          sample rows for product development. Live market adapters (Aave markets, DEX pools, Earn
          receipt assets) are the next integration step; no APY here is a live market rate.
        </div>
      ) : null}

      {STRATEGY_ORDER.map((group) => {
        const rows = opportunities.filter((o) => o.strategyType === group.key);
        if (rows.length === 0) return null;

        return (
          <Panel key={group.key}>
            <PanelHeader
              title={group.label}
              eyebrow={`${rows.length} candidate${rows.length === 1 ? "" : "s"}`}
              meta={
                rows.every((r) => r.dataMode === "live") ? (
                  <span className="chip border-accent/30 text-accent">
                    <StatusDot tone="ok" /> Live
                  </span>
                ) : (
                  <span className="chip border-warn/30 text-warn">
                    <StatusDot tone="warn" /> Sample
                  </span>
                )
              }
            />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left">
                    <th className="px-5 py-2.5 text-xs font-medium text-ink-faint">Market</th>
                    <th className="px-5 py-2.5 text-xs font-medium text-ink-faint">Protocol</th>
                    <th className="px-5 py-2.5 text-xs font-medium text-ink-faint">Chain</th>
                    <th className="px-5 py-2.5 text-right text-xs font-medium text-ink-faint">Rate</th>
                    <th className="px-5 py-2.5 text-right text-xs font-medium text-ink-faint">
                      Liquidity
                    </th>
                    <th className="px-5 py-2.5 text-right text-xs font-medium text-ink-faint">
                      Observed
                    </th>
                    <th className="px-5 py-2.5 text-right text-xs font-medium text-ink-faint">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((row) => {
                    const payload = row.sourcePayload as { expectedProfitUsd?: number } | null | undefined;
                    const isArb = row.strategyType === "arbitrage";
                    const hasProfit = typeof payload?.expectedProfitUsd === "number";

                    return (
                      <tr key={row.id} className="hover:bg-surface-raised/40">
                        <td className="px-5 py-3">
                          <p className="text-ink">{row.tokenOrPairRef}</p>
                          <p className="font-mono text-[11px] text-ink-faint">
                            {row.marketOrPoolAddress ?? "address pending verification"}
                          </p>
                        </td>
                        <td className="px-5 py-3 text-ink-muted">{row.protocol.name}</td>
                        <td className="px-5 py-3 text-ink-muted">
                          {row.chainId === 8453 ? "Base" : row.chainId === 42161 ? "Arbitrum" : row.chainId}
                        </td>
                        <td className="px-5 py-3 text-right metric" data-numeric>
                          <span className="text-ink">
                            {isArb && hasProfit
                              ? formatUsdDelta(payload?.expectedProfitUsd)
                              : formatPercent(row.estimatedApy)}
                          </span>
                          <span className="ml-1 text-[10px] uppercase text-ink-faint">
                            {isArb ? "net est." : (row.rateType ?? "")}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right metric text-ink-muted" data-numeric>
                          {formatUsd(row.liquidityUsd ?? row.tvlUsd, { whole: true })}
                        </td>
                        <td className="px-5 py-3 text-right text-xs text-ink-faint">
                          {formatDateTime(row.observedAt)}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <Link
                            href={`/execute?direction=${row.chainId === 42161 ? "base-to-arb" : "arb-to-base"}&amount=100`}
                            className="btn btn-secondary px-2.5 py-1 text-xs"
                          >
                            Move funds →
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
      })}
    </div>
  );
}
