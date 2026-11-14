import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowDownLeft, ArrowLeftRight, ArrowRight } from "lucide-react";
import { CardIcon } from "@/components/opportunities/opportunity-card";
import { HoldingCard, PlanRow, PositionCard, SectionHead } from "@/components/portfolio/cards";
import { buttonClass } from "@/components/ui/button";
import { SyncButton } from "@/components/ui/sync-button";
import { DataTag } from "@/components/ui/tag";
import { getPrisma } from "@/lib/db/client";
import { formatPercent, formatUsd } from "@/lib/format";
import { topOpportunities } from "@/lib/opportunities/queries";
import { chainLabel, OPPORTUNITY_TABS } from "@/lib/opportunities/tabs";
import { getCurrentPortfolio, getCurrentViewer } from "@/lib/platform-context";
import { timeAgo } from "@/lib/ui/time";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const viewer = await getCurrentViewer();
  if (!viewer) redirect("/signin");
  const portfolio = await getCurrentPortfolio();
  const now = new Date();

  const [top, plans] = await Promise.all([
    topOpportunities(2),
    portfolio?.scope || !viewer.demo
      ? getPrisma().executionPlan.findMany({
          where: { userId: viewer.userId, ...(viewer.demo ? { simulationKey: portfolio?.scope } : {}), status: { not: "draft" } },
          include: { steps: { select: { status: true } } },
          orderBy: { createdAt: "desc" },
          take: 4,
        })
      : Promise.resolve([]),
  ]);

  const holdings = portfolio?.holdings ?? [];
  const positions = (portfolio?.openPositions ?? []).slice(0, 4);
  const empty = holdings.length === 0 && positions.length === 0;

  return (
    <div className="space-y-12">
      {empty ? (
        <section className="rounded-[var(--radius-panel)] bg-hero p-6 text-hero-ink md:p-8">
          <h2 className="type-h4 text-balance">Fund your account</h2>
          <p className="mt-2 max-w-md text-pretty text-hero-muted">Receive USDC or ETH on Base or Arbitrum, then pick an opportunity.</p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link href="/receive" className={buttonClass("hero-primary", "lg", "btn-hero h-12 w-auto px-6")}>
              <ArrowDownLeft className="size-5" strokeWidth={1.75} aria-hidden />
              Receive
            </Link>
            <Link href="/opportunities/lending" className={buttonClass("hero", "lg", "h-12 w-auto px-6")}>
              Browse opportunities
            </Link>
          </div>
        </section>
      ) : null}

      {holdings.length > 0 ? (
        <section>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="type-h5 flex items-center gap-2 text-ink">
              Holdings <DataTag dataMode={portfolio?.dataMode ?? "live"} />
            </h2>
            <div className="flex items-center gap-2">
              <span className="hidden text-sm text-ink-muted sm:inline">Read {timeAgo(portfolio?.observedAt ?? null, now)}</span>
              {!viewer.demo ? <SyncButton endpoint="/api/portfolio/sync" label="Sync" /> : null}
            </div>
          </div>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {holdings.map((holding) => (
              <li key={`${holding.chainId}:${holding.tokenAddress}`} className="contents">
                <HoldingCard holding={holding} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {positions.length > 0 ? (
        <section>
          <SectionHead title="Positions" href="/positions" />
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {positions.map((position) => (
              <li key={position.id} className="contents">
                <PositionCard position={position} now={now} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <SectionHead title="Top opportunities" href="/opportunities/lending" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {OPPORTUNITY_TABS.filter((tab) => tab.slug !== "copytrading" && top[tab.slug]?.length).map((tab) => (
            <div key={tab.slug} className="card-tile p-2">
              <div className="flex items-center justify-between px-3 pt-2 pb-1">
                <h3 className="type-card-title text-ink">{tab.label}</h3>
                <Link href={`/opportunities/${tab.slug}`} className="text-sm text-ink-muted hover:text-ink">
                  See all
                </Link>
              </div>
              <ul>
                {top[tab.slug]!.map((card) => (
                  <li key={card.id}>
                    <Link
                      href={`/opportunities/${card.tab}/${card.id}`}
                      className="flex items-center gap-3 rounded-[var(--radius-control)] px-3 py-3 transition-colors duration-100 hover:bg-surface"
                    >
                      <CardIcon card={card} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-ink">{card.title}</span>
                        <span className="block truncate text-sm text-ink-muted">
                          {card.protocolName} · {chainLabel(card.chainId)}
                        </span>
                      </span>
                      <span className="text-right">
                        <span className="block text-ink tabular-nums">
                          {card.tab === "arbitrage"
                            ? formatUsd(card.expectedProfitUsd)
                            : card.tab === "stocks"
                              ? formatUsd(card.navUsd)
                              : formatPercent(card.ratePercent)}
                        </span>
                        <span className="block text-sm text-ink-muted">
                          {card.tab === "arbitrage" ? "per trade" : card.tab === "stocks" ? card.ticker : card.rateType ?? "APY"}
                        </span>
                      </span>
                      <ArrowRight className="size-4 shrink-0 text-ink-faint" strokeWidth={1.5} aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {Object.keys(top).length === 0 ? (
            <div className="card-tile items-start p-6">
              <p className="type-card-title text-ink">No markets synced yet</p>
              <p className="mt-1 text-sm text-ink-muted">Pull live rates to fill this in.</p>
              <div className="mt-4">
                <SyncButton endpoint="/api/opportunities/sync" label="Sync markets" variant="primary" />
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section>
        <SectionHead title="Recent activity" href="/activity" />
        {plans.length ? (
          <div className="card-tile p-2">
            {plans.map((plan) => (
              <PlanRow key={plan.id} plan={plan} now={now} />
            ))}
          </div>
        ) : (
          <div className="card-tile flex-row flex-wrap items-center justify-between gap-4 p-5">
            <p className="text-ink-muted">Nothing yet. Swap or open a position to see it here.</p>
            <Link href="/swap" className={buttonClass("secondary", "md")}>
              <ArrowLeftRight className="size-4" strokeWidth={1.5} aria-hidden />
              Swap
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
