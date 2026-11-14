import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight, BadgeCheck, ExternalLink, Landmark, LineChart, Waypoints } from "lucide-react";
import { ExecutePanel, type FundingSource } from "@/components/execution/execute-panel";
import { CardIcon, SessionTag } from "@/components/opportunities/opportunity-card";
import { TipProvider, Tip } from "@/components/ui/popover";
import { Sparkline } from "@/components/ui/sparkline";
import { DataTag, Tag } from "@/components/ui/tag";
import { usdcOn, findTrackedTokenBySymbol } from "@/lib/execution/plan/assets";
import { isSimulatedFor } from "@/lib/execution/plan/scope";
import { resolveEntryTarget } from "@/lib/execution/plan/targets";
import { getPrisma } from "@/lib/db/client";
import { formatDateTime, formatPercent, formatUsd, shortenMiddle } from "@/lib/format";
import { getOpportunityDetail } from "@/lib/opportunities/queries";
import { chainLabel, findTab, riskLabel } from "@/lib/opportunities/tabs";
import { getCurrentPortfolio, getCurrentSession, getCurrentViewer } from "@/lib/platform-context";
import { getTrader } from "@/lib/copytrading/traders";
import { ownedAddresses } from "@/lib/wallet/accounts";
import { TraderDetail } from "@/components/copytrading/trader-detail";
import { compactUsd, timeAgo } from "@/lib/ui/time";

export const dynamic = "force-dynamic";

const EXPLORERS: Record<number, string> = { 8453: "https://basescan.org", 42161: "https://arbiscan.io", 1: "https://etherscan.io" };

export default async function OpportunityDetailPage({ params }: PageProps<"/opportunities/[tab]/[id]">) {
  const { tab: tabSlug, id } = await params;
  const tab = findTab(tabSlug);
  if (!tab) notFound();
  if (tab.slug === "copytrading") {
    const [trader, session] = await Promise.all([getTrader(decodeURIComponent(id)), getCurrentSession()]);
    if (!trader) notFound();
    return <TraderDetail trader={trader} signedIn={session.authenticated} />;
  }

  const [detail, viewer, portfolio] = await Promise.all([getOpportunityDetail(id), getCurrentViewer(), getCurrentPortfolio()]);
  if (!detail) notFound();
  const { card } = detail;
  const now = new Date();

  const row = await getPrisma().opportunity.findUnique({
    where: { id },
    include: { protocol: { select: { id: true, slug: true, name: true } } },
  });
  const target = row ? resolveEntryTarget(row) : { error: "Not found" };
  const targetOk = !("error" in target);

  // Simulated: one source per network, all wallets together. Live: one per verified wallet and
  // network, because only that wallet can sign the transfer.
  const simulated = viewer ? isSimulatedFor(viewer) : true;
  const payers = viewer && !simulated ? [...(await ownedAddresses(viewer.userId))] : [null];
  const sources: FundingSource[] = targetOk
    ? target.sourceChainIds.flatMap((chainId) => {
        const token = target.action === "arbitrage" ? usdcOn(chainId) : findTrackedTokenBySymbol(chainId, target.asset.symbol);
        if (!token) return [];
        const holding = portfolio?.holdings.find((h) => h.chainId === chainId && h.tokenAddress === token.address.toLowerCase());
        return payers.map((walletAddress) => ({
          walletAddress,
          chainId,
          chainName: chainLabel(chainId),
          address: token.address,
          symbol: token.symbol,
          decimals: token.decimals,
          amountAtomic: (walletAddress
            ? (holding?.wallets.find((w) => w.address === walletAddress)?.amountAtomic ?? 0n)
            : (holding?.amountAtomic ?? 0n)
          ).toString(),
          priceUsd: holding?.priceUsd ?? (token.isStablecoin ? 1 : null),
        }));
      })
    : [];

  const blockedReason = !viewer
    ? "Connect a wallet to continue"
    : !targetOk
      ? target.error
      : detail.status !== "active"
        ? `Market is ${detail.status}`
        : null;

  const actionLabel =
    targetOk && target.action === "supply"
      ? "Lend"
      : targetOk && target.action === "vault_deposit"
        ? "Deposit"
        : targetOk && target.action === "lp_mint"
          ? "Add liquidity"
          : targetOk && target.action === "equity_buy"
            ? `Buy ${card.ticker ?? card.title}`
            : "Run trade";

  const steps = targetOk ? routeSteps(target.action) : [];
  const rates = detail.observations.map((o) => o.rate).filter((r): r is number => r !== null);
  const address = detail.marketOrPoolAddress;

  return (
    <TipProvider>
      <div className="space-y-8">
        <Link href={`/opportunities/${tab.slug}`} className="inline-flex items-center gap-2 text-[0.9375rem] text-ink-muted hover:text-ink">
          <ArrowLeft className="size-4" strokeWidth={1.5} aria-hidden />
          {tab.label}
        </Link>

        <header className="flex flex-wrap items-center gap-4">
          <CardIcon card={card} size="xl" />
          <div className="min-w-0 flex-1">
            <h1 className="type-h3 text-balance text-ink">{card.title}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-ink-muted">
              <span>{card.issuer ?? card.protocolName}</span>
              <span aria-hidden>·</span>
              <span>{chainLabel(card.chainId)}</span>
              <span aria-hidden>·</span>
              <span>
                Updated <time dateTime={card.observedAt} title={formatDateTime(card.observedAt)}>{timeAgo(card.observedAt, now)}</time>
              </span>
            </p>
          </div>
          <DataTag dataMode={card.dataMode} />
        </header>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start">
          {/* Phones and tablets: numbers, then the panel, then the research. Desktop: panel on the right. */}
          <section aria-label="Key metrics" className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:col-start-1 lg:row-start-1">
            {card.tab === "arbitrage" ? (
              <>
                <Tile label="Est. net / trade" value={formatUsd(card.expectedProfitUsd)} />
                <Tile label="Trade size" value={compactUsd(card.tradeSizeUsd)} />
                <Tile label="Route" value={card.route ? `${chainLabel(card.route.from)} → ${chainLabel(card.route.to)}` : "—"} />
                <Tile label="Liquidity" value={compactUsd(card.liquidityUsd ?? card.tvlUsd)} />
              </>
            ) : card.tab === "stocks" ? (
              <>
                <Tile label="Reference price" value={formatUsd(card.navUsd)} />
                <Tile label="DEX vs reference" value={card.spreadBps !== null ? `${card.spreadBps.toFixed(0)} bps` : "No DEX price"} />
                <Tile label="Market" value={<SessionTag session={card.session} commodity={card.isCommodity} />} />
                <Tile label="Liquidity" value={compactUsd(card.liquidityUsd)} />
              </>
            ) : (
              <>
                <Tile label={card.rateType ?? "APY"} value={formatPercent(card.ratePercent)} strong />
                <Tile label="TVL" value={compactUsd(card.tvlUsd)} />
                <Tile label={card.tab === "pools" ? "24h volume" : "Liquidity"} value={compactUsd(card.tab === "pools" ? card.volume24hUsd : card.liquidityUsd)} />
                <Tile label="Network" value={chainLabel(card.chainId)} />
              </>
            )}
          </section>
          <aside aria-label="Execute" className="card-tile p-5 lg:sticky lg:top-24 lg:col-start-2 lg:row-span-2 lg:row-start-1">
            <h2 className="type-h6 mb-4 text-ink">{actionLabel}</h2>
            <ExecutePanel
              opportunityId={card.id}
              targetChainId={targetOk ? target.chainId : card.chainId}
              sources={sources}
              actionLabel={actionLabel}
              simulated={simulated}
              blockedReason={blockedReason}
            />
          </aside>
          <div className="space-y-8 lg:col-start-1 lg:row-start-2">
            <section className="card-tile p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="type-card-title flex items-center gap-2 text-ink">
                  <LineChart className="size-5 text-ink-secondary" strokeWidth={1.5} aria-hidden />
                  Rate history
                </h2>
                <span className="text-sm text-ink-muted">{rates.length} observation{rates.length === 1 ? "" : "s"}</span>
              </div>
              {rates.length >= 3 ? (
                <Sparkline points={rates} height={140} className="mt-4 w-full" />
              ) : (
                <p className="mt-3 text-sm text-pretty text-ink-muted">History builds with each market sync. Nothing is drawn until there are three real readings.</p>
              )}
            </section>

            {steps.length ? (
              <section aria-labelledby="how-heading">
                <h2 id="how-heading" className="type-card-title text-ink">
                  What Execute does
                </h2>
                <ol className="mt-4 flex flex-wrap items-center gap-2">
                  {steps.map((step, index) => (
                    <li key={step.label} className="flex items-center gap-2">
                      <span className="flex h-11 items-center gap-2 rounded-full border border-line px-4 text-[0.9375rem] text-ink">
                        <step.icon className="size-4 text-ink-secondary" strokeWidth={1.5} aria-hidden />
                        {step.label}
                      </span>
                      {index < steps.length - 1 ? <ArrowRight className="size-4 text-ink-faint" strokeWidth={1.5} aria-hidden /> : null}
                    </li>
                  ))}
                </ol>
                <p className="mt-3 text-sm text-pretty text-ink-muted">Each step settles on its own. A move between networks only happens when you pay from another network.</p>
              </section>
            ) : null}

            {card.riskFlags.length ? (
              <section aria-labelledby="risk-heading">
                <h2 id="risk-heading" className="type-card-title text-ink">
                  Risks
                </h2>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {card.riskFlags.map((flag) => (
                    <li key={flag}>
                      <Tag tone="warn">{riskLabel(flag)}</Tag>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section className="card-tile divide-y divide-line">
              <Row label="Protocol">
                <span className="flex items-center gap-3">
                  {detail.protocol.name}
                  {detail.protocol.websiteUrl ? (
                    <a href={detail.protocol.websiteUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-ink-muted hover:text-ink">
                      Website <ExternalLink className="size-3.5" strokeWidth={1.5} aria-hidden />
                    </a>
                  ) : null}
                  {detail.protocol.docsUrl ? (
                    <a href={detail.protocol.docsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-ink-muted hover:text-ink">
                      Docs <ExternalLink className="size-3.5" strokeWidth={1.5} aria-hidden />
                    </a>
                  ) : null}
                </span>
              </Row>
              {address ? (
                <Row label="Contract">
                  <a
                    href={`${EXPLORERS[card.chainId] ?? EXPLORERS[8453]}/address/${address}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-mono text-sm hover:text-ink"
                  >
                    {shortenMiddle(address, 8, 6)}
                    <ExternalLink className="size-3.5" strokeWidth={1.5} aria-hidden />
                  </a>
                </Row>
              ) : null}
              <Row label="Source">
                <Tip content={formatDateTime(card.observedAt)}>
                  <span tabIndex={0} className="cursor-help">
                    {typeof detail.payload.provider === "string" ? detail.payload.provider : detail.protocol.name} · {timeAgo(card.observedAt, now)}
                  </span>
                </Tip>
              </Row>
              {detail.protocol.riskNotes ? <Row label="Notes">{detail.protocol.riskNotes}</Row> : null}
            </section>
          </div>
        </div>
      </div>
    </TipProvider>
  );
}

function routeSteps(action: string) {
  const deposit =
    action === "supply" ? "Supply" : action === "vault_deposit" ? "Deposit" : action === "lp_mint" ? "Add liquidity" : action === "equity_buy" ? "Buy" : "Sell";
  if (action === "arbitrage") {
    return [
      { label: "Buy & bridge", icon: Waypoints },
      { label: "Sell", icon: Landmark },
      { label: "Record", icon: BadgeCheck },
    ];
  }
  return [
    { label: "Bridge if needed", icon: Waypoints },
    { label: "Approve", icon: BadgeCheck },
    { label: deposit, icon: Landmark },
    { label: "Track", icon: LineChart },
  ];
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
    <div className="flex flex-col gap-1 px-5 py-4 text-[0.9375rem] sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <span className="shrink-0 text-ink-muted">{label}</span>
      <span className="text-pretty text-ink-secondary sm:text-right">{children}</span>
    </div>
  );
}
