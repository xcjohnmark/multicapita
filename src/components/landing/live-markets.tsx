import Link from "next/link";
import { getPrisma } from "@/lib/db/client";
import { ChainBadge } from "@/components/ui/primitives";

/**
 * Landing-page market table. Shows only rows the ingestion engine labelled `live`, each with its
 * provider and observation time. If nothing has been synced yet it says so — it never renders
 * placeholder rates (AGENTS.md rule 3).
 */

const STRATEGY_LABEL: Record<string, string> = {
  yield_vault: "Yield vault",
  lending: "Lending",
  stablecoin_lp: "Stablecoin LP",
};

const PROVIDER_LABEL: Record<string, string> = {
  aave_v3_onchain_rpc: "Aave V3 on-chain",
  defillama_yields_api: "DefiLlama Yields",
  dexscreener_v1_pair: "DEX Screener",
};

type MarketRow = {
  id: string;
  strategyType: string;
  protocolName: string;
  chainId: number;
  asset: string;
  apy: number;
  rateType: string | null;
  source: string;
  observedAt: Date;
};

async function loadLiveMarkets(): Promise<MarketRow[]> {
  try {
    const rows = await getPrisma().opportunity.findMany({
      where: {
        status: "active",
        dataMode: "live",
        strategyType: { in: Object.keys(STRATEGY_LABEL) },
        estimatedApy: { not: null },
      },
      include: { protocol: true },
      orderBy: { estimatedApy: { sort: "desc", nulls: "last" } },
      take: 24,
    });

    return rows
      .map((row) => {
        const provider = (row.sourcePayload as { provider?: unknown } | null)?.provider;
        return {
          id: row.id,
          strategyType: row.strategyType,
          protocolName: row.protocol.name,
          chainId: row.chainId,
          asset: row.tokenOrPairRef,
          apy: row.estimatedApy ?? 0,
          rateType: row.rateType,
          source: typeof provider === "string" ? provider : "",
          observedAt: row.observedAt,
        };
      })
      .filter((row) => row.source !== "" && row.source !== "sample_fallback")
      .slice(0, 6);
  } catch {
    // Landing must render even if the database is unreachable.
    return [];
  }
}

function relativeTime(date: Date, now: Date): string {
  const minutes = Math.max(0, Math.round((now.getTime() - date.getTime()) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

export async function LiveMarketsSection() {
  const rows = await loadLiveMarkets();
  const now = new Date();

  return (
    <section id="markets" className="section bg-canvas">
      <div className="mx-auto max-w-[1120px]">
        <div className="section-head">
          <p className="eyebrow">Markets</p>
          <h2 className="type-h2 text-ink">Real rates, with their sources</h2>
          <p className="type-body-lg text-ink-secondary">
            Every rate Capita shows comes from an on-chain read or a named data provider, stamped
            with when it was observed. A rate is research; only a fresh quote is executable.
          </p>
        </div>

        <div className="panel overflow-hidden bg-surface">
          {rows.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <p className="type-h5 text-ink">No live market data synced yet</p>
              <p className="type-body-sm mx-auto mt-2 max-w-md text-ink-muted">
                Rates appear here after the market sync runs. Capita does not fill this table with
                placeholder numbers.
              </p>
              <Link href="/opportunities" className="btn btn-secondary mt-6 h-10 px-4">
                Open opportunities
              </Link>
            </div>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="eyebrow border-b border-line">
                  <th className="px-6 py-3 font-medium">Market</th>
                  <th className="hidden px-6 py-3 font-medium md:table-cell">Chain</th>
                  <th className="px-6 py-3 text-right font-medium">Rate</th>
                  <th className="hidden px-6 py-3 text-right font-medium sm:table-cell">Source</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-line last:border-b-0 bg-canvas">
                    <td className="px-6 py-4">
                      <p className="type-body-md text-ink">{row.protocolName}</p>
                      <p className="type-body-sm text-ink-muted">
                        {STRATEGY_LABEL[row.strategyType]} · {row.asset}
                      </p>
                    </td>
                    <td className="hidden px-6 py-4 md:table-cell">
                      <ChainBadge chainId={row.chainId} />
                    </td>
                    <td className="px-6 py-4 text-right">
                      <p className="metric text-lg text-accent-text" data-numeric>
                        {row.apy.toFixed(2)}%
                      </p>
                      <p className="text-xs text-ink-muted">{row.rateType ?? "APY"}, variable</p>
                    </td>
                    <td className="hidden px-6 py-4 text-right sm:table-cell">
                      <p className="type-body-sm text-ink-secondary">
                        {PROVIDER_LABEL[row.source] ?? row.source}
                      </p>
                      <time
                        className="text-xs text-ink-muted"
                        dateTime={row.observedAt.toISOString()}
                        title={row.observedAt.toISOString()}
                      >
                        {relativeTime(row.observedAt, now)}
                      </time>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <p className="mt-4 text-center text-xs text-ink-muted">
          Rates are variable and not guaranteed. Principal is at risk in every DeFi strategy.
        </p>
      </div>
    </section>
  );
}
