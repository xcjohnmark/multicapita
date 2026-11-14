import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { CopyRulesForm } from "@/components/copytrading/copy-rules-form";
import { buttonClass } from "@/components/ui/button";
import { Identicon } from "@/components/ui/identicon";
import { DataTag, Tag } from "@/components/ui/tag";
import { TokenOnChain } from "@/components/ui/token-stack";
import { ProtocolIcon, protocolLogoKey } from "@/components/ui/protocol-icon";
import { findTrackedToken } from "@/lib/execution/plan/assets";
import type { TraderPositionItem } from "@/lib/copytrading/policy";
import type { TraderCard } from "@/lib/copytrading/traders";
import { traderName } from "@/lib/copytrading/traders";
import { formatPercent, formatUsd, formatUsdDelta, shortenMiddle } from "@/lib/format";

/** A trader's profile, holdings as cards (each with Copy), and the copy rules form. */
export function TraderDetail({ trader, signedIn }: { trader: TraderCard; signedIn: boolean }) {
  const explorer = trader.ecosystem === "evm" ? `https://debank.com/profile/${trader.address}` : null;
  return (
    <div className="space-y-8">
      <Link href="/opportunities/copytrading" className="inline-flex items-center gap-2 text-[0.9375rem] text-ink-muted hover:text-ink">
        <ArrowLeft className="size-4" strokeWidth={1.5} aria-hidden />
        Copytrading
      </Link>

      <header className="flex flex-wrap items-center gap-4">
        <Identicon seed={trader.address} size={56} />
        <div className="min-w-0 flex-1">
          <h1 className="type-h3 text-balance text-ink">{traderName(trader)}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-ink-muted">
            <span className="font-mono text-sm">{shortenMiddle(trader.address, 6, 4)}</span>
            <span aria-hidden>·</span>
            <span>{trader.primaryStyle}</span>
            {explorer ? (
              <a href={explorer} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-ink">
                Profile <ExternalLink className="size-3.5" strokeWidth={1.5} aria-hidden />
              </a>
            ) : null}
          </p>
        </div>
        <DataTag dataMode={trader.dataMode} />
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start">
        <section aria-label="Track record" className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:col-start-1 lg:row-start-1">
          <Tile label="P&L, 90d" value={formatUsdDelta(trader.realisedPnl90dUsd)} />
          <Tile label="Win rate" value={formatPercent(trader.winRatePercent, 0)} />
          <Tile label="Max drawdown" value={formatPercent(trader.maxDrawdownPercent, 1)} />
          <Tile label="Holdings" value={String(trader.positions.length)} />
        </section>
        <aside aria-label="Copy rules" className="card-tile p-5 lg:sticky lg:top-24 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <h2 className="type-h6 mb-4 text-ink">Copy this wallet</h2>
          <CopyRulesForm traderAddress={trader.address} ecosystem={trader.ecosystem} signedIn={signedIn} />
        </aside>
        <div className="space-y-8 lg:col-start-1 lg:row-start-2">

          <div className="flex flex-wrap gap-2">
            {trader.isMemecoinFree ? <Tag tone="positive">No memecoins</Tag> : <Tag tone="warn">Holds memecoins</Tag>}
            {trader.hasExternalHedgeWarning ? <Tag tone="warn">May hedge elsewhere</Tag> : null}
          </div>

          {trader.aiSummary ? (
            <section className="card-tile p-5">
              <h2 className="type-card-title text-ink">Wallet X-Ray</h2>
              <p className="mt-2 text-pretty text-ink-secondary">{trader.aiSummary}</p>
            </section>
          ) : null}

          <section>
            <h2 className="type-h5 mb-4 text-ink">Holdings</h2>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {trader.positions.map((position) => {
                const copyHref = copyTarget(position);
                const logo = protocolLogoKey(position.symbol);
                return (
                  <li key={`${position.chainId}-${position.contractAddress}-${position.actionKind}`} className="card-tile p-4">
                    <div className="flex items-center gap-3">
                      {logo ? (
                        <ProtocolIcon hints={[position.symbol]} label={position.symbol} size="md" />
                      ) : (
                        <TokenOnChain symbol={position.symbol} chainId={position.chainId} size="lg" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-ink">{position.symbol}</p>
                        <p className="truncate text-sm text-ink-muted">
                          {position.protocolName} · {position.chainName}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-ink tabular-nums">{formatUsd(position.valueUsd)}</p>
                        <p className="text-sm text-ink-muted tabular-nums">{formatPercent(position.weightPercent, 1)}</p>
                      </div>
                    </div>
                    <div className="mt-4 flex justify-end">
                      {copyHref ? (
                        <Link href={copyHref} className={buttonClass("secondary", "sm", "h-9 px-4")}>
                          Copy
                        </Link>
                      ) : (
                        <Tag>{position.copyableVia === "blocked_memecoin" ? "Not copied" : "Not available"}</Tag>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-panel)] bg-surface p-4">
      <p className="text-sm text-ink-muted">{label}</p>
      <p className="figure mt-1.5 truncate text-xl leading-7 text-ink">{value}</p>
    </div>
  );
}

/** Where "Copy" goes: the matching market for a lending/vault holding, Swap for a plain token. */
function copyTarget(position: TraderPositionItem): string | null {
  if (position.copyableVia === "blocked_memecoin" || ![8453, 42161].includes(position.chainId)) return null;
  if (/aave/i.test(position.protocolName)) return "/opportunities/lending";
  if (position.assetClass === "vault_receipt") return "/opportunities/vaults";
  const token = findTrackedToken(position.chainId, position.contractAddress);
  return token ? `/swap?to=${token.chainId}:${token.address.toLowerCase()}` : null;
}
