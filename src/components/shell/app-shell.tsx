"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { WalletConnect } from "@/components/wallet/wallet-connect";

const NAV = [
  { href: "/", label: "Overview", hint: "Portfolio" },
  { href: "/opportunities", label: "Opportunities", hint: "Markets" },
  { href: "/strategy", label: "Strategy", hint: "Build" },
  { href: "/execute", label: "Execute", hint: "Move" },
  { href: "/positions", label: "Positions", hint: "Manage" },
  { href: "/activity", label: "Activity", hint: "Audit" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <aside className="lg:sticky lg:top-0 lg:h-dvh lg:w-60 lg:shrink-0 border-b border-line lg:border-b-0 lg:border-r">
        <div className="flex h-14 items-center justify-between px-4 lg:h-16">
          <Link href="/" className="flex items-center gap-2.5">
            <LogoMark />
            <span className="text-sm font-semibold tracking-tight">Portfolio Operator</span>
          </Link>
          <span className="chip lg:hidden">NEAR</span>
        </div>

        <nav aria-label="Primary" className="hidden lg:block px-3 pt-2">
          <ul className="space-y-0.5">
            {NAV.map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`group flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors ${
                      active
                        ? "bg-surface-raised text-ink"
                        : "text-ink-muted hover:bg-surface hover:text-ink"
                    }`}
                  >
                    <span>{item.label}</span>
                    <span className="text-[10px] uppercase tracking-wider text-ink-faint">
                      {item.hint}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="hidden lg:absolute lg:bottom-0 lg:w-60 lg:border-t lg:border-line lg:p-3">
          <div className="flex items-center justify-between rounded-md bg-surface px-3 py-2">
            <div>
              <p className="eyebrow">Networks</p>
              <p className="text-xs text-ink-muted">Base · Arbitrum</p>
            </div>
            <span className="size-1.5 rounded-full bg-accent" aria-hidden />
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-line bg-canvas/90 px-4 backdrop-blur lg:h-16 lg:px-8">
          <div className="flex items-center gap-2 overflow-x-auto lg:hidden">
            {NAV.map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs ${
                    active ? "bg-surface-raised text-ink" : "text-ink-muted"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>

          <div className="hidden items-center gap-2 text-xs text-ink-muted lg:flex">
            <span className="eyebrow">Mode</span>
            <ModeChip />
          </div>

          <div className="flex items-center gap-2">
            <WalletConnect />
            <Link href="/opportunities" className="btn btn-primary h-9 px-3 text-sm">
              Find opportunities
            </Link>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1240px] flex-1 px-4 py-6 lg:px-8 lg:py-8">
          {children}
        </main>

        <footer className="border-t border-line px-4 py-4 text-xs text-ink-faint lg:px-8">
          <p>
            Non-custodial. Quotes are sourced from NEAR Intents 1Click; every figure shows its
            source and timestamp. DeFi returns are variable and principal is not guaranteed.
          </p>
        </footer>
      </div>
    </div>
  );
}

function ModeChip() {
  // The mode is resolved server-side; this is a static, honest placeholder until the
  // config endpoint is wired into the shell.
  return (
    <span className="chip border-line-strong text-ink-muted">
      <span className="size-1.5 rounded-full bg-warn" aria-hidden />
      Sample data
    </span>
  );
}

function LogoMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="1" y="1" width="22" height="22" rx="6" stroke="currentColor" opacity="0.35" />
      <path d="M6 15.5 10 8l4 7.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M14.5 15.5 16.5 11l2 4.5" stroke="var(--color-accent)" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
