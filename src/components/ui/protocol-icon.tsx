import { cn } from "@/lib/ui/cn";

/**
 * Protocol / issuer logo from `public/logos/protocols` (downloaded once from DefiLlama's icon
 * set, never hotlinked at runtime). Unknown protocols get a monogram so a card never shows a
 * broken image.
 */

const LOGOS: Array<[RegExp, string]> = [
  [/gauntlet|gtusdc/i, "gauntlet"],
  [/spark/i, "spark"],
  [/aave/i, "aave"],
  [/uniswap/i, "uniswap"],
  [/morpho/i, "morpho"],
  [/moonwell|mwusdc/i, "moonwell"],
  [/aerodrome/i, "aerodrome"],
  [/camelot/i, "camelot"],
  [/ondo/i, "ondo"],
  [/dinari/i, "dinari"],
  [/tether|xaut/i, "tether"],
  [/1click|near|intents/i, "near"],
];

export function protocolLogoKey(...hints: Array<string | null | undefined>): string | null {
  const text = hints.filter(Boolean).join(" ");
  for (const [pattern, key] of LOGOS) {
    if (pattern.test(text)) return key;
  }
  return null;
}

const SIZES = { sm: "size-6", md: "size-10", lg: "size-12", xl: "size-14" } as const;

export function ProtocolIcon({
  hints,
  label,
  size = "lg",
  className,
}: {
  hints: Array<string | null | undefined>;
  label: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const key = protocolLogoKey(...hints);
  if (key) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- tiny local logo, no optimisation needed
      <img
        src={`/logos/protocols/${key}.webp`}
        alt=""
        aria-hidden
        className={cn(SIZES[size], "shrink-0 rounded-full border border-line-faint bg-canvas object-cover", className)}
      />
    );
  }
  return <Monogram text={label} size={size} className={className} />;
}

/** Ticker / name monogram on a dark disc (stocks, unknown issuers). */
export function Monogram({
  text,
  size = "lg",
  className,
}: {
  text: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const letters = text.replace(/[^A-Za-z0-9]/g, "").slice(0, size === "sm" ? 1 : 2).toUpperCase() || "?";
  return (
    <span
      aria-hidden
      className={cn(
        SIZES[size],
        "grid shrink-0 place-items-center rounded-full bg-hero font-medium text-hero-ink",
        size === "sm" ? "text-[11px]" : size === "md" ? "text-xs" : "text-sm",
        className,
      )}
    >
      {letters}
    </span>
  );
}
