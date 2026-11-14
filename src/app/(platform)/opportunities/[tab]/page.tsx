import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowRight } from "lucide-react";
import { CardIcon, OpportunityCard, SessionTag } from "@/components/opportunities/opportunity-card";
import { OpportunityToolbar } from "@/components/opportunities/opportunity-toolbar";
import { TraderCard } from "@/components/opportunities/trader-card";
import { SubTabs } from "@/components/shell/top-tabs";
import { SyncButton } from "@/components/ui/sync-button";
import { DataTag } from "@/components/ui/tag";
import { listTraders } from "@/lib/copytrading/traders";
import { formatPercent, formatUsd } from "@/lib/format";
import { listOpportunities, type OpportunityCardData, type OpportunitySort } from "@/lib/opportunities/queries";
import { chainLabel, findTab, OPPORTUNITY_TABS } from "@/lib/opportunities/tabs";
import { compactUsd, timeAgo } from "@/lib/ui/time";

export const dynamic = "force-dynamic";

const SORTS: OpportunitySort[] = ["rate", "tvl", "risk", "recent"];

export default async function OpportunityTabPage({ params, searchParams }: PageProps<"/opportunities/[tab]">) {
  const { tab: slug } = await params;
  const tab = findTab(slug);
  if (!tab) notFound();
  const sp = await searchParams;
  const one = (key: string) => (typeof sp[key] === "string" ? (sp[key] as string) : null);
  const chain = Number(one("chain")) || null;
  const sort = SORTS.includes(one("sort") as OpportunitySort) ? (one("sort") as OpportunitySort) : "rate";
  const view = one("view") === "table" ? "table" : "grid";
  const now = new Date();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="type-h3 text-balance text-ink">Opportunities</h1>
          <p className="mt-1 text-ink-muted">{tab.blurb}</p>
        </div>
        {tab.slug !== "copytrading" ? <SyncButton endpoint="/api/opportunities/sync" label="Sync markets" /> : null}
      </div>

      <SubTabs
        ariaLabel="Opportunity types"
        active={tab.slug}
        tabs={OPPORTUNITY_TABS.map((t) => ({ key: t.slug, label: t.label, href: `/opportunities/${t.slug}` }))}
      />

      {tab.slug === "copytrading" ? (
        <TradersGrid />
      ) : (
        <>
          <Suspense>
            <OpportunityToolbar
              chains={tab.slug === "stocks" ? [42161, 1] : [8453, 42161]}
              showAssetFilter={tab.slug === "lending" || tab.slug === "vaults"}
            />
          </Suspense>
          <Results
            tab={tab.slug}
            chain={chain}
            q={one("q")}
            sort={sort}
            asset={one("asset")}
            view={view}
            now={now}
          />
        </>
      )}
    </div>
  );
}

async function Results(props: {
  tab: (typeof OPPORTUNITY_TABS)[number]["slug"];
  chain: number | null;
  q: string | null;
  sort: OpportunitySort;
  asset: string | null;
  view: "grid" | "table";
  now: Date;
}) {
  const cards = await listOpportunities(props);
  if (cards.length === 0) {
    const filtered = Boolean(props.chain || props.q || props.asset);
    return (
      <div className="card-tile items-center px-6 py-16 text-center">
        <p className="type-card-title text-ink">{filtered ? "Nothing matches" : "No markets synced yet"}</p>
        <p className="mt-1.5 max-w-sm text-sm text-pretty text-ink-muted">
          {filtered ? "Clear a filter to see more." : "Sync markets to pull live rates for this tab."}
        </p>
        {filtered ? (
          <Link href={`/opportunities/${props.tab}`} className="btn btn-secondary mt-5 h-10 px-4">
            Clear filters
          </Link>
        ) : (
          <div className="mt-5">
            <SyncButton endpoint="/api/opportunities/sync" label="Sync markets" variant="primary" />
          </div>
        )}
      </div>
    );
  }
  if (props.view === "table") return <OpportunityTable cards={cards} now={props.now} />;
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map((card) => (
        <li key={card.id} className="contents">
          <OpportunityCard card={card} now={props.now} />
        </li>
      ))}
    </ul>
  );
}

function OpportunityTable({ cards, now }: { cards: OpportunityCardData[]; now: Date }) {
  return (
    <div className="card-tile overflow-x-auto">
      <table className="w-full text-left text-[0.9375rem] lg:min-w-[720px]">
        <thead className="text-sm text-ink-muted">
          <tr className="border-b border-line">
            <th className="py-3 pr-2 pl-4 font-normal md:px-5">Market</th>
            <th className="hidden px-3 py-3 font-normal md:table-cell">Network</th>
            <th className="px-3 py-3 text-right font-normal">Return</th>
            <th className="hidden px-3 py-3 text-right font-normal sm:table-cell">TVL</th>
            <th className="hidden px-3 py-3 text-right font-normal lg:table-cell">Updated</th>
            <th className="py-3 pr-4 pl-1 md:px-5">
              <span className="sr-only">Explore</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {cards.map((card) => (
            <tr key={card.id} className="border-b border-line-faint last:border-0 hover:bg-surface">
              <td className="py-3 pr-2 pl-4 md:px-5">
                <span className="flex min-w-0 items-center gap-3">
                  <CardIcon card={card} />
                  <span className="min-w-0">
                    <span className="block truncate text-ink">{card.title}</span>
                    <span className="block truncate text-sm text-ink-muted">{card.issuer ?? card.protocolName}</span>
                  </span>
                  <span className="hidden sm:inline-flex"><DataTag dataMode={card.dataMode} /></span>
                </span>
              </td>
              <td className="hidden px-3 py-3 text-ink-secondary md:table-cell">{chainLabel(card.chainId)}</td>
              <td className="px-3 py-3 text-right text-ink tabular-nums">
                {card.tab === "arbitrage" ? (
                  formatUsd(card.expectedProfitUsd)
                ) : card.tab === "stocks" ? (
                  <SessionTag session={card.session} commodity={card.isCommodity} />
                ) : (
                  formatPercent(card.ratePercent)
                )}
              </td>
              <td className="hidden px-3 py-3 text-right text-ink-secondary tabular-nums sm:table-cell">{compactUsd(card.tvlUsd)}</td>
              <td className="hidden px-3 py-3 text-right text-ink-muted tabular-nums lg:table-cell">{timeAgo(card.observedAt, now)}</td>
              <td className="py-3 pr-4 pl-1 text-right md:px-5">
                <Link href={`/opportunities/${card.tab}/${card.id}`} className="btn btn-secondary h-10 px-3" aria-label={`Explore ${card.title}`}>
                  <span className="hidden md:inline">Explore</span>
                  <ArrowRight className="size-4" strokeWidth={1.75} aria-hidden />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function TradersGrid() {
  const traders = await listTraders();
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {traders.map((trader) => (
        <li key={trader.address} className="contents">
          <TraderCard trader={trader} />
        </li>
      ))}
    </ul>
  );
}
