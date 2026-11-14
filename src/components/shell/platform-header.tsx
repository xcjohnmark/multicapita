import Link from "next/link";
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import type { ShellSession } from "@/lib/shell-state";
import { BalanceFigure } from "./balance-figure";
import { HeaderActions } from "./header-actions";
import { Logo } from "./logo";
import { TopTabs } from "./top-tabs";

/**
 * near.com/home header: the one sanctioned dark surface (DESIGN.md §0.1). Balance on the left,
 * Receive / Send / Swap on the right (stacked under it on mobile), then the light tab bar.
 */
export function PlatformHeader({
  session,
  totals,
  simulated,
}: {
  session: ShellSession;
  totals: { totalUsd: number; availableUsd: number; deployedUsd: number } | null;
  simulated: boolean;
}) {
  return (
    <>
      <header className="bg-hero text-hero-ink">
        <div className="shell-container">
          <div className="flex h-16 items-center justify-between gap-3">
            <Logo tone="invert" />
            <HeaderActions session={session} tone="invert" />
          </div>
          <div className="grid grid-cols-1 gap-8 pt-6 pb-8 md:grid-cols-[1fr_minmax(0,26rem)] md:items-end md:pt-10 md:pb-12">
            <div>
              {totals ? (
                <BalanceFigure totalUsd={totals.totalUsd} availableUsd={totals.availableUsd} deployedUsd={totals.deployedUsd} />
              ) : (
                <div>
                  <p className="text-[0.9375rem] text-hero-muted">Total balance</p>
                  <p className="figure mt-1 text-[2.75rem] leading-none text-hero-muted sm:text-[3.5rem]">$—</p>
                  <p className="mt-3 text-sm text-hero-muted">Connect a wallet to see your balance.</p>
                </div>
              )}
              {session.dataMode !== "live" || simulated ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {session.demo ? <Tag tone="dark">Demo account</Tag> : null}
                  {session.dataMode !== "live" ? <Tag tone="dark">Simulated settlement</Tag> : null}
                </div>
              ) : null}
            </div>
            <nav aria-label="Wallet actions" className="grid grid-cols-3 gap-2">
              <Link href="/receive" className={buttonClass("hero-primary", "md", "btn-hero h-14 flex-col gap-0.5 text-[0.9375rem] sm:flex-row sm:gap-2")}>
                <ArrowDownLeft className="size-5" strokeWidth={1.75} aria-hidden />
                Receive
              </Link>
              <Link href="/send" className={buttonClass("hero", "md", "h-14 flex-col gap-0.5 text-[0.9375rem] sm:flex-row sm:gap-2")}>
                <ArrowUpRight className="size-5" strokeWidth={1.75} aria-hidden />
                Send
              </Link>
              <Link href="/swap" className={buttonClass("hero", "md", "h-14 flex-col gap-0.5 text-[0.9375rem] sm:flex-row sm:gap-2")}>
                <ArrowLeftRight className="size-5" strokeWidth={1.75} aria-hidden />
                Swap
              </Link>
            </nav>
          </div>
        </div>
      </header>
      <TopTabs />
    </>
  );
}
