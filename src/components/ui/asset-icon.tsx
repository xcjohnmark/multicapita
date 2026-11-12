"use client";

import { useState, type ReactNode } from "react";
import {
  UsdcLogo,
  UsdtLogo,
  EthereumLogo,
  BtcLogo,
  NearLogo,
  BaseLogo,
  ArbitrumLogo,
  SolanaLogo,
  MorphoLogo,
  AaveLogo,
  UniswapLogo,
  CompoundLogo,
  CurveLogo,
  KaminoLogo,
} from "@/components/landing/token-logos";

export interface AssetIconProps {
  symbolOrName: string;
  className?: string;
  size?: "xs" | "sm" | "md" | "lg";
}

const SIZE_CLASSES = {
  xs: "size-3.5",
  sm: "size-4",
  md: "size-5",
  lg: "size-7",
};

// Comprehensive Symbol Map to Vector Components
const SVG_REGISTRY: Record<string, (props: { className?: string }) => ReactNode> = {
  // Stablecoins & Tokens
  usdc: UsdcLogo,
  "usdc.e": UsdcLogo,
  usdce: UsdcLogo,
  usdt: UsdtLogo,
  eth: EthereumLogo,
  weth: EthereumLogo,
  btc: BtcLogo,
  wbtc: BtcLogo,
  near: NearLogo,
  wnear: NearLogo,
  sol: SolanaLogo,

  // Chains
  base: BaseLogo,
  arbitrum: ArbitrumLogo,
  "arbitrum one": ArbitrumLogo,
  ethereum: EthereumLogo,
  solana: SolanaLogo,

  // Protocols & Vaults
  morpho: MorphoLogo,
  "morpho blue": MorphoLogo,
  gauntlet: MorphoLogo,
  aave: AaveLogo,
  "aave v3": AaveLogo,
  uniswap: UniswapLogo,
  "uniswap v3": UniswapLogo,
  compound: CompoundLogo,
  "compound v3": CompoundLogo,
  curve: CurveLogo,
  kamino: KaminoLogo,
};

// Fallback CDN for arbitrary tokens (matches Cryptocurrency Icons standard)
function getCdnUrl(symbol: string): string {
  const clean = symbol.toLowerCase().trim().replace(/[^a-z0-9]/g, "");
  return `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/${clean}.svg`;
}

export function AssetIcon({ symbolOrName, className = "", size = "md" }: AssetIconProps) {
  const [imageError, setImageError] = useState(false);
  const cleanKey = symbolOrName.toLowerCase().trim();
  const sizeClass = SIZE_CLASSES[size];

  // 1. First check our high-fidelity, zero-latency vector registry
  const SvgComponent = SVG_REGISTRY[cleanKey];
  if (SvgComponent) {
    return <SvgComponent className={`${sizeClass} shrink-0 ${className}`} />;
  }

  // 2. Second, try the open cryptocurrency vector CDN
  if (!imageError) {
    return (
      <img
        src={getCdnUrl(symbolOrName)}
        alt={`${symbolOrName} icon`}
        className={`${sizeClass} shrink-0 rounded-full object-contain ${className}`}
        onError={() => setImageError(true)}
        loading="lazy"
      />
    );
  }

  // 3. Fallback: Clean styled monogram badge
  const initial = (symbolOrName[0] ?? "?").toUpperCase();
  return (
    <div
      className={`${sizeClass} shrink-0 rounded-full bg-surface-raised border border-line flex items-center justify-center font-bold font-mono text-[10px] text-ink-secondary select-none ${className}`}
    >
      {initial}
    </div>
  );
}
