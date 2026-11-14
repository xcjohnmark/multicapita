"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { Compass, History, House, Layers, Sparkles } from "lucide-react";
import { cn } from "@/lib/ui/cn";

const TABS = [
  { href: "/app", label: "Home", short: "Home", icon: House, match: (p: string) => p === "/app" },
  { href: "/opportunities/lending", label: "Opportunities", short: "Explore", icon: Compass, match: (p: string) => p.startsWith("/opportunities") },
  { href: "/positions", label: "Positions", short: "Positions", icon: Layers, match: (p: string) => p.startsWith("/positions") },
  { href: "/strategy", label: "Strategy", short: "Strategy", icon: Sparkles, match: (p: string) => p.startsWith("/strategy") },
  { href: "/activity", label: "Activity", short: "Activity", icon: History, match: (p: string) => p.startsWith("/activity") || p.startsWith("/plans") },
] as const;

/**
 * Sticky top tabs under the hero, from tablet width up. Phones get `BottomNav` instead: five tabs
 * don't fit across 390px without hiding some of them.
 */
export function TopTabs() {
  const pathname = usePathname();
  return (
    <div className="sticky top-0 z-[var(--z-header)] hidden border-b border-line bg-canvas/95 backdrop-blur md:block">
      <nav aria-label="Sections" className="shell-container">
        <ul className="-mb-px flex gap-7">
          {TABS.map((tab) => (
            <li key={tab.href}>
              <Link href={tab.href} className="tab-link" aria-current={tab.match(pathname) ? "page" : undefined}>
                {tab.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

/** Phone tab bar: fixed to the bottom, thumb-reachable, clear of the home indicator. */
export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Sections"
      className="fixed inset-x-0 bottom-0 z-[var(--z-header)] border-t border-line bg-canvas/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="grid grid-cols-5">
        {TABS.map((tab) => {
          const active = tab.match(pathname);
          const Icon = tab.icon;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-1 text-[11px] transition-colors duration-100",
                  active ? "text-ink" : "text-ink-muted",
                )}
              >
                <Icon className="size-[22px]" strokeWidth={active ? 2 : 1.5} aria-hidden />
                {tab.short}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Secondary tab row (opportunity categories). Links, so each tab has its own URL. On narrow
 * screens it scrolls sideways, keeps the active tab in view and fades at the edge to show there's
 * more.
 */
export function SubTabs({
  tabs,
  active,
  ariaLabel,
}: {
  tabs: readonly { href: string; label: string; key: string }[];
  active: string;
  ariaLabel: string;
}) {
  const scroller = useRef<HTMLElement>(null);
  useEffect(() => {
    const strip = scroller.current;
    const el = strip?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!strip || !el) return;
    // Horizontal only: never move the page vertically.
    strip.scrollLeft = el.offsetLeft - (strip.clientWidth - el.offsetWidth) / 2;
  }, [active]);
  return (
    <nav ref={scroller} aria-label={ariaLabel} className="no-scrollbar scroll-fade -mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <ul className="flex gap-1">
        {tabs.map((tab) => (
          <li key={tab.key} className="shrink-0">
            <Link
              href={tab.href}
              scroll={false}
              aria-current={tab.key === active ? "page" : undefined}
              className="chip-filter aria-[current=page]:bg-hero aria-[current=page]:text-hero-ink"
            >
              {tab.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
