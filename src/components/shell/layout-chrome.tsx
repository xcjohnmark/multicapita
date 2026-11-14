import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import type { ShellSession } from "@/lib/shell-state";
import { HeaderActions } from "./header-actions";
import { Logo } from "./logo";

/** Slim strip that keeps the data mode visible on every page (AGENTS.md rule 3). */
export function ModeStrip({ session }: { session: ShellSession }) {
  if (session.dataMode === "live" && !session.demo) return null;
  const text =
    session.dataMode === "sample"
      ? "Demo mode: sample data. Nothing here is a live rate or a real balance."
      : session.dataMode === "dry_run"
        ? "Dry run: live quotes and prices, simulated settlement. Nothing is signed."
        : "Demo account: simulations only.";
  return (
    <div role="status" className="border-b border-line bg-surface">
      <p className="shell-container py-2 text-center text-sm text-pretty text-ink-secondary">{text}</p>
    </div>
  );
}

/** Compact light header for detail pages: logo, back, icon actions. */
export function CompactHeader({ session, back }: { session: ShellSession; back?: { href: string; label: string } }) {
  return (
    <header className="sticky top-0 z-[var(--z-header)] border-b border-line bg-canvas/95 backdrop-blur">
      <div className="shell-container flex h-16 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {back ? (
            <Link href={back.href} className="btn btn-ghost btn-icon size-11 rounded-[var(--radius-control)]" aria-label={back.label}>
              <ArrowLeft className="size-5" strokeWidth={1.5} />
            </Link>
          ) : null}
          <Logo />
        </div>
        <HeaderActions session={session} tone="ink" />
      </div>
    </header>
  );
}

export function PlatformFooter() {
  return (
    <footer className="mt-16 border-t border-line">
      <div className="shell-container flex flex-col justify-between gap-2 py-6 text-sm text-ink-muted sm:flex-row">
        <p>Non-custodial. Cross-chain legs settle through NEAR Intents 1Click.</p>
        <p>Every figure shows its source and time.</p>
      </div>
    </footer>
  );
}

/** Centred single-purpose flow page (near.com Send/Receive) with a floating back button. */
export function FlowPage({
  title,
  backHref = "/app",
  actions,
  children,
}: {
  title: string;
  backHref?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[640px] px-4 pt-6 pb-32 md:pt-10">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="type-h4 text-balance text-ink">{title}</h1>
        {actions}
      </div>
      {children}
      <Link href={backHref} className="fab-back" aria-label="Back">
        <ArrowLeft className="size-6" strokeWidth={1.75} />
      </Link>
    </div>
  );
}
