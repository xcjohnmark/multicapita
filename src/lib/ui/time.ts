/** Short relative age ("now", "4m", "3h", "2d") computed on the server at render time. */
export function timeAgo(iso: string | Date | null | undefined, now = new Date()): string {
  if (!iso) return "—";
  const then = typeof iso === "string" ? new Date(iso) : iso;
  const seconds = Math.max(0, Math.round((now.getTime() - then.getTime()) / 1000));
  if (seconds < 45) return "now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** Compact USD for tiles: $1.2M, $84.5K, $950. */
export function compactUsd(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(value);
}
