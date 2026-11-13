import type { ReactNode } from "react";
import { AssetIcon } from "@/components/ui/asset-icon";

export function Panel({
  children,
  className = "",
  as: Tag = "section",
  variant = "default",
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "article";
  variant?: "default" | "inset";
}) {
  const base = variant === "inset" ? "panel-inset" : "panel";
  return <Tag className={`${base} ${className}`}>{children}</Tag>;
}

export function PanelHeader({
  title,
  eyebrow,
  meta,
  action,
}: {
  title: string;
  eyebrow?: string;
  meta?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="panel-header">
      <div className="min-w-0">
        {eyebrow ? <p className="eyebrow mb-1">{eyebrow}</p> : null}
        <h2 className="type-card-title truncate text-ink">{title}</h2>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {meta}
        {action}
      </div>
    </div>
  );
}

export function Metric({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "default" | "positive" | "negative";
}) {
  const toneClass =
    tone === "positive"
      ? "text-accent-text"
      : tone === "negative"
        ? "text-danger-text"
        : "text-ink";
  return (
    <div className="px-5 py-4">
      <p className="eyebrow mb-1.5">{label}</p>
      <p className={`metric text-2xl font-medium leading-7 ${toneClass}`} data-numeric>
        {value}
      </p>
      {sub ? <p className="mt-1 text-xs text-ink-muted">{sub}</p> : null}
    </div>
  );
}

export function StatusDot({
  tone,
  pulse = false,
}: {
  tone: "ok" | "warn" | "error" | "info" | "idle";
  pulse?: boolean;
}) {
  const color =
    tone === "ok"
      ? "bg-accent"
      : tone === "warn"
        ? "bg-warn"
        : tone === "error"
          ? "bg-danger"
          : tone === "info"
            ? "bg-info"
            : "bg-ink-faint";
  return (
    <span
      className={`inline-block size-1.5 shrink-0 rounded-full ${color} ${pulse ? "animate-pulse" : ""}`}
      aria-hidden
    />
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="px-5 py-12 text-center">
      <p className="type-card-title text-ink">{title}</p>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-ink-muted">{description}</p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

const CHAIN_META: Record<number, { name: string; symbol: string }> = {
  8453: { name: "Base", symbol: "base" },
  42161: { name: "Arbitrum", symbol: "arbitrum" },
  1: { name: "Ethereum", symbol: "ethereum" },
};

export function ChainBadge({ chainId, label }: { chainId?: number; label?: string }) {
  const resolved = chainId ? CHAIN_META[chainId] : undefined;
  const text = label ?? resolved?.name ?? (chainId ? `Chain ${chainId}` : "Unknown");

  return (
    <span className="chip inline-flex items-center gap-1.5 py-1">
      {resolved?.symbol ? (
        <AssetIcon symbolOrName={resolved.symbol} size="xs" />
      ) : (
        <span className="size-1.5 shrink-0 rounded-full bg-ink-faint" aria-hidden />
      )}
      <span>{text}</span>
    </span>
  );
}

export function DataModeBanner({
  dataMode,
  message,
  title,
}: {
  dataMode: string;
  title?: string;
  message: string;
}) {
  if (dataMode === "live") return null;
  const isDryRun = dataMode === "dry_run";
  return (
    <div
      role="status"
      className={`rounded-[var(--radius-control)] border px-4 py-3 text-sm ${
        isDryRun
          ? "border-blue-200 bg-blue-50/70 text-ink"
          : "border-amber-200 bg-amber-50/70 text-ink"
      }`}
    >
      <p className="leading-relaxed">
        <span className={`font-medium ${isDryRun ? "text-blue-700" : "text-amber-800"}`}>
          {title ?? (isDryRun ? "Dry run mode." : "Demo mode.")}{" "}
        </span>
        <span className="text-ink-secondary">{message}</span>
      </p>
    </div>
  );
}
