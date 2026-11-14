import { formatAtomic } from "@/lib/finance/amounts";

/**
 * Display an exact atomic amount with grouping and a bounded number of fraction digits. Uses the
 * exact decimal string (never a float) and truncates, so a balance is never shown rounded up.
 */
export function displayAmount(atomic: string | bigint | null | undefined, decimals: number, maxFraction = 6): string {
  if (atomic === null || atomic === undefined) return "—";
  const exact = formatAtomic(typeof atomic === "string" ? BigInt(atomic) : atomic, decimals);
  const [whole, fraction = ""] = exact.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const cut = fraction.slice(0, maxFraction).replace(/0+$/, "");
  return cut ? `${grouped}.${cut}` : grouped;
}

/** Decimal string for an input field (no grouping), e.g. for "Max". */
export function inputAmount(atomic: string | bigint, decimals: number): string {
  return formatAtomic(typeof atomic === "string" ? BigInt(atomic) : atomic, decimals);
}

/** `bps` share of an atomic amount as an input string (25% / 50% / 75% shortcuts). */
export function shareInput(atomic: string, decimals: number, bps: number): string {
  return inputAmount((BigInt(atomic) * BigInt(bps)) / 10_000n, decimals);
}
