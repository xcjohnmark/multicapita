import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, ShieldAlert } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { ProtocolIcon, Monogram } from "@/components/ui/protocol-icon";
import { Sparkline } from "@/components/ui/sparkline";
import { DataTag, Tag } from "@/components/ui/tag";
import { ChainIcon, TokenStack } from "@/components/ui/token-stack";
import { formatPercent, formatUsd } from "@/lib/format";
import type { OpportunityCardData } from "@/lib/opportunities/queries";
import { chainLabel } from "@/lib/opportunities/tabs";
import { compactUsd, timeAgo } from "@/lib/ui/time";

/**
 * One card per opportunity: who, where, the one number that matters, two supporting facts and
 * Explore. Variants differ only in the headline number, because an arbitrage gap is not a yield
 * and a stock has no rate (AGENTS.md rule 2/3).
 */
export function OpportunityCard({ card, now }: { card: OpportunityCardData; now: Date }) {
  const href = `/opportunities/${card.tab}/${card.id}`;
  return (
    <article className="card-tile p-5">
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <CardIcon card={card} />
          <div className="min-w-0">
            <h3 className="type-card-title truncate text-ink">{card.title}</h3>
            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-ink-muted">
              <span className="truncate">{card.issuer ?? card.protocolName}</span>
              <span aria-hidden>·</span>
              <ChainIcon chainId={card.chainId} />
              <span>{chainLabel(card.chainId)}</span>
            </p>
          </div>
        </div>
        <DataTag dataMode={card.dataMode} />
      </header>

      <div className="mt-6 flex items-end justify-between gap-3">
        <Headline card={card} />
        {card.sparkline.length >= 3 ? <Sparkline points={card.sparkline} height={40} className="w-24" /> : null}
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4 text-sm">
        <Facts card={card} />
      </dl>

      <footer className="mt-5 flex items-center justify-between gap-3">
        <span className="flex items-center gap-1.5 text-sm text-ink-muted">
          {card.riskFlags.length > 0 ? (
            <>
              <ShieldAlert className="size-4" strokeWidth={1.5} aria-hidden />
              {card.riskFlags.length} {card.riskFlags.length === 1 ? "risk" : "risks"}
            </>
          ) : (
            <span>{timeAgo(card.observedAt, now)}</span>
          )}
        </span>
        <Link href={href} className={buttonClass("primary", "md", "h-10 px-4")} aria-label={`Explore ${card.title} on ${card.protocolName}`}>
          Explore
          <ArrowRight className="size-4" strokeWidth={1.75} aria-hidden />
        </Link>
      </footer>
    </article>
  );
}

export function CardIcon({ card, size = "lg" }: { card: OpportunityCardData; size?: "lg" | "xl" }) {
  if (card.tab === "stocks") {
    return card.issuer ? (
      <ProtocolIcon hints={[card.issuer, card.protocolName]} label={card.ticker ?? card.title} size={size} />
    ) : (
      <Monogram text={card.ticker ?? card.title} size={size} />
    );
  }
  if (card.tab === "pools" || card.tab === "arbitrage") {
    return (
      <span className="relative">
        <ProtocolIcon hints={[card.protocolSlug, card.protocolName]} label={card.protocolName} size={size} />
        <span className="absolute -right-1.5 -bottom-1.5">
          <TokenStack symbols={card.assetSymbols} size="sm" />
        </span>
      </span>
    );
  }
  return <ProtocolIcon hints={[card.protocolSlug, card.protocolName, card.title]} label={card.protocolName} size={size} />;
}

function Headline({ card }: { card: OpportunityCardData }) {
  if (card.tab === "arbitrage") {
    return (
      <Big
        value={card.expectedProfitUsd !== null ? formatUsd(card.expectedProfitUsd) : "—"}
        label={card.tradeSizeUsd ? `Est. net per ${compactUsd(card.tradeSizeUsd)} trade` : "Est. net per trade"}
      />
    );
  }
  if (card.tab === "stocks") {
    return (
      <Big
        value={card.navUsd !== null ? formatUsd(card.navUsd) : "—"}
        label={card.spreadBps !== null ? `${card.spreadBps.toFixed(0)} bps vs reference` : "No DEX price yet"}
      />
    );
  }
  return (
    <Big
      value={formatPercent(card.ratePercent)}
      label={card.tab === "pools" ? `${card.rateType === "APR" ? "Fee APR" : "Fee APY"} est.` : card.rateType ?? "APY"}
      tone={card.ratePercent !== null ? "up" : undefined}
    />
  );
}

function Big({ value, label, tone }: { value: string; label: string; tone?: "up" }) {
  return (
    <div>
      <p className={`figure text-[2rem] leading-none ${tone === "up" ? "text-ink" : "text-ink"}`}>{value}</p>
      <p className="mt-1.5 text-sm text-ink-muted">{label}</p>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="mt-0.5 truncate text-ink tabular-nums">{children}</dd>
    </div>
  );
}

function Facts({ card }: { card: OpportunityCardData }) {
  switch (card.tab) {
    case "pools":
      return (
        <>
          <Fact label="TVL">{compactUsd(card.tvlUsd)}</Fact>
          <Fact label="24h volume">{compactUsd(card.volume24hUsd)}</Fact>
        </>
      );
    case "arbitrage":
      return (
        <>
          <Fact label="Route">
            {card.route ? `${chainLabel(card.route.from)} → ${chainLabel(card.route.to)}` : "—"}
          </Fact>
          <Fact label="Liquidity">{compactUsd(card.liquidityUsd ?? card.tvlUsd)}</Fact>
        </>
      );
    case "stocks":
      return (
        <>
          <Fact label="Ticker">{card.ticker ?? "—"}</Fact>
          <Fact label="Market">
            <SessionTag session={card.session} commodity={card.isCommodity} />
          </Fact>
        </>
      );
    default:
      return (
        <>
          <Fact label="TVL">{compactUsd(card.tvlUsd)}</Fact>
          <Fact label="Asset">{card.assetSymbols.join(" / ")}</Fact>
        </>
      );
  }
}

export function SessionTag({ session, commodity }: { session: OpportunityCardData["session"]; commodity: boolean }) {
  if (commodity) return <Tag tone="positive">24/7</Tag>;
  if (session === "OPEN") return <Tag tone="positive">Open</Tag>;
  if (session === "EXTENDED") return <Tag tone="warn">Extended</Tag>;
  if (session === "CLOSED") return <Tag tone="neutral">Closed</Tag>;
  return <span>—</span>;
}
