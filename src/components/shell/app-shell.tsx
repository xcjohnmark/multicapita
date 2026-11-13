"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  ArrowLeftRight,
  ArrowUpRight,
  Compass,
  History,
  Layers,
  LayoutGrid,
  Sparkles,
  Users,
} from "lucide-react";
import { SessionMenu } from "@/components/shell/session-menu";
import { StatusDot } from "@/components/ui/primitives";
import type { ShellSession } from "@/lib/shell-state";

const NAV = [
  { href: "/app", label: "Overview", icon: LayoutGrid },
  { href: "/opportunities", label: "Opportunities", icon: Compass },
  { href: "/copytrading", label: "Copytrading", icon: Users },
  { href: "/strategy", label: "Strategy", icon: Sparkles },
  { href: "/execute", label: "Execute", icon: ArrowLeftRight },
  { href: "/positions", label: "Positions", icon: Layers },
  { href: "/activity", label: "Activity", icon: History },
] as const;

export function AppShell({
  children,
  session,
}: {
  children: ReactNode;
  session: ShellSession;
}) {
  const pathname = usePathname();
  const isMarketingPage = pathname === "/";

  if (isMarketingPage) {
    return <div className="min-h-dvh flex flex-col bg-canvas">{children}</div>;
  }

  return (
    <div className="flex min-h-dvh flex-col bg-canvas lg:flex-row">
      <aside className="border-b border-line bg-canvas lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-[232px] lg:shrink-0 lg:flex-col lg:border-b-0 lg:border-r">
        <div className="flex h-14 items-center justify-between px-4 lg:h-16 lg:px-5">
          <Link href="/" className="flex items-center gap-2.5 rounded-lg outline-offset-4">
            <LogoMark />
            <span className="type-card-title tracking-tight text-ink">Capita</span>
          </Link>
          <span className="lg:hidden">
            <ModeChip session={session} />
          </span>
        </div>

        <nav aria-label="Primary" className="hidden flex-1 px-3 pt-2 lg:block">
          <ul className="space-y-1">
            {NAV.map((item) => {
              const active = item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className="nav-link"
                  >
                    <Icon
                      className={`size-5 shrink-0 ${active ? "text-ink" : "text-ink-muted group-hover:text-ink"}`}
                      strokeWidth={1.5}
                      aria-hidden
                    />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="hidden border-t border-line p-3 lg:block">
          <div className="flex items-center justify-between rounded-xl border border-line bg-surface px-3 py-2.5">
            <div>
              <p className="eyebrow">Networks</p>
              <p className="mt-0.5 text-xs font-medium text-ink-secondary">Base · Arbitrum</p>
            </div>
            <StatusDot tone="ok" />
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-line bg-canvas/90 px-4 backdrop-blur lg:h-16 lg:px-8">
          <nav aria-label="Mobile" className="flex items-center gap-1 overflow-x-auto lg:hidden">
            {NAV.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-medium tracking-tight transition-colors duration-100 ${
                    active ? "bg-surface-raised text-ink" : "text-ink-muted hover:text-ink"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="hidden items-center gap-2 text-xs text-ink-muted lg:flex">
            <ModeChip session={session} />
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <SessionMenu session={session} />
            <Link href="/opportunities" className="btn btn-primary h-9 px-3.5 text-sm">
              <span>Explore</span>
              <ArrowUpRight className="size-4" strokeWidth={1.5} aria-hidden />
            </Link>
          </div>
        </header>

        <main
          id="dashboard"
          className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-6 lg:px-8 lg:py-8"
        >
          {children}
        </main>

        <footer className="border-t border-line bg-surface px-4 py-4 text-xs text-ink-muted lg:px-8">
          <div className="mx-auto flex max-w-[1200px] flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <p>
              Capita — All your crypto. One place. Non-custodial cross-chain portfolio operator
              settling via NEAR Intents 1Click.
            </p>
            <p className="text-ink-faint">Every figure displays source provenance and timestamp.</p>
          </div>
        </footer>
      </div>
    </div>
  );
}

function ModeChip({ session }: { session: ShellSession }) {
  const live = session.dataMode === "live";
  const dryRun = session.dataMode === "dry_run";
  return (
    <span
      className={`chip ${
        live
          ? "border-green-200 bg-green-50 text-accent-text"
          : dryRun
            ? "border-blue-200 bg-blue-50 text-blue-700"
            : "border-amber-200 bg-amber-50 text-amber-800"
      }`}
      title={session.executionReason ?? undefined}
    >
      <StatusDot tone={live ? "ok" : dryRun ? "info" : "warn"} />
      {session.dataModeLabel}
    </span>
  );
}

function LogoMark() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="#111827"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="42 14"
      />
      <circle cx="17.5" cy="8" r="2.25" fill="#22C55E" />
    </svg>
  );
}
