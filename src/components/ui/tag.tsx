import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";

/**
 * Small status label. Tone always pairs with text, never colour alone (DESIGN.md §2.6).
 *  - `sim`: produced by a simulated plan; `sample`: seeded demo data; `live`: on-chain.
 */
export type TagTone = "neutral" | "positive" | "negative" | "warn" | "info" | "sim" | "sample" | "dark";

const TONES: Record<TagTone, string> = {
  neutral: "bg-surface-raised text-ink-secondary",
  positive: "bg-green-50 text-accent-text",
  negative: "bg-red-50 text-danger-text",
  warn: "bg-amber-50 text-warn-text",
  info: "bg-blue-50 text-blue-700",
  sim: "bg-violet-50 text-violet-700",
  sample: "bg-amber-50 text-warn-text",
  dark: "bg-hero-raised text-hero-ink",
};

export function Tag({
  tone = "neutral",
  children,
  className,
  icon,
}: {
  tone?: TagTone;
  children: ReactNode;
  className?: string;
  icon?: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-medium whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/** Label for a row's provenance: live / sample / simulated. */
export function DataTag({ dataMode, simulated }: { dataMode: string; simulated?: boolean }) {
  if (simulated || dataMode === "dry_run") return <Tag tone="sim">Simulated</Tag>;
  if (dataMode === "sample") return <Tag tone="sample">Sample</Tag>;
  return null;
}
