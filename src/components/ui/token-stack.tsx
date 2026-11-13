"use client";

import { AssetIcon } from "@/components/ui/asset-icon";
import { cn } from "@/lib/ui/cn";

const CHAIN_ICON: Record<number, string> = { 8453: "base", 42161: "arbitrum", 1: "ethereum" };

/** Overlapping token icons (near.com "Receive 85+ assets" stack, LP pairs). */
export function TokenStack({ symbols, size = "md" }: { symbols: string[]; size?: "sm" | "md" | "lg" }) {
  return (
    <span className="flex items-center">
      {symbols.map((symbol, index) => (
        <span
          key={`${symbol}-${index}`}
          className={cn(
            "grid place-items-center rounded-full bg-canvas ring-2 ring-canvas",
            index > 0 && "-ml-2",
            size === "lg" ? "size-9" : size === "md" ? "size-7" : "size-5",
          )}
        >
          <AssetIcon symbolOrName={symbol} size={size === "lg" ? "lg" : size === "md" ? "md" : "sm"} />
        </span>
      ))}
    </span>
  );
}

/** Token icon with a small chain badge in the corner. */
export function TokenOnChain({
  symbol,
  chainId,
  size = "md",
}: {
  symbol: string;
  chainId: number;
  size?: "md" | "lg";
}) {
  const chain = CHAIN_ICON[chainId];
  return (
    <span className={cn("relative inline-grid shrink-0 place-items-center", size === "lg" ? "size-10" : "size-8")}>
      <AssetIcon symbolOrName={symbol} size="lg" className={size === "lg" ? "size-10" : "size-8"} />
      {chain ? (
        <span className="absolute -right-0.5 -bottom-0.5 grid size-4 place-items-center rounded-full bg-canvas ring-2 ring-canvas">
          <AssetIcon symbolOrName={chain} size="xs" />
        </span>
      ) : null}
    </span>
  );
}

export function ChainIcon({ chainId, className }: { chainId: number; className?: string }) {
  const chain = CHAIN_ICON[chainId];
  if (!chain) return null;
  return <AssetIcon symbolOrName={chain} size="sm" className={className} />;
}
