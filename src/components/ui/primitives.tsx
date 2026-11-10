import type { ReactNode } from "react";

export function Panel({
  children,
  className = "",
  as: Tag = "section",
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "article";
}) {
  return <Tag className={`panel ${className}`}>{children}</Tag>;
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
        <h2 className="truncate text-sm font-semibold text-ink">{title}</h2>
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
    tone === "positive" ? "text-accent" : tone === "negative" ? "text-danger" : "text-ink";
  return (
    <div className="px-4 py-4 sm:px-5">
      <p className="eyebrow mb-2">{label}</p>
      <p className={`metric text-xl leading-7 sm:text-2xl ${toneClass}`} data-numeric>
        {value}
      </p>
      {sub ? <p className="mt-1 text-xs text-ink-faint">{sub}</p> : null}
    </div>
  );
}

export function StatusDot({ tone }: { tone: "ok" | "warn" | "error" | "idle" }) {
  const color =
    tone === "ok"
      ? "bg-accent"
      : tone === "warn"
        ? "bg-warn"
        : tone === "error"
          ? "bg-danger"
          : "bg-ink-faint";
  return <span className={`inline-block size-1.5 rounded-full ${color}`} aria-hidden />;
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
      <p className="text-sm font-medium text-ink">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-ink-muted">{description}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
