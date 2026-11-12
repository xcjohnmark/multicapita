import { arbitrum, base } from "viem/chains";
import { env } from "@/lib/env";

/**
 * MVP chain scope: Base (8453) and Arbitrum One (42161).
 * Both are in the live 1Click catalogue; both have USDC. USDT is NOT available on
 * either through 1Click, so stablecoin routes here are USDC-first.
 */

export type TrackedToken = {
  chainId: number;
  symbol: string;
  name: string;
  address: `0x${string}`;
  decimals: number;
  isNative?: boolean;
  assetId?: string;
  canonicalAssetId?: string;
  coingeckoId?: string;
  isStablecoin?: boolean;
};

export type SupportedChain = {
  id: number;
  slug: "base" | "arbitrum";
  name: string;
  /** 1Click `blockchain` identifier, not the chain name. */
  oneClickBlockchain: "base" | "arb";
  explorerUrl: string;
  /** USDC contract verified against the live 1Click catalogue. */
  usdc: { symbol: string; address: `0x${string}`; decimals: number };
  rpcUrl: string;
  fallbackRpcUrls: readonly string[];
  tokens: readonly TrackedToken[];
};

export const BASE_TOKENS: readonly TrackedToken[] = [
  {
    chainId: base.id,
    symbol: "ETH",
    name: "Ether",
    address: "0x0000000000000000000000000000000000000000",
    decimals: 18,
    isNative: true,
    canonicalAssetId: "ethereum",
    coingeckoId: "ethereum",
  },
  {
    chainId: base.id,
    symbol: "USDC",
    name: "USD Coin",
    address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    decimals: 6,
    isStablecoin: true,
    assetId: "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near",
    canonicalAssetId: "usd-coin",
    coingeckoId: "usd-coin",
  },
  {
    chainId: base.id,
    symbol: "WETH",
    name: "Wrapped Ether",
    address: "0x4200000000000000000000000000000000000006",
    decimals: 18,
    canonicalAssetId: "ethereum",
    coingeckoId: "ethereum",
  },
  {
    chainId: base.id,
    symbol: "cbBTC",
    name: "Coinbase Wrapped BTC",
    address: "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf",
    decimals: 8,
    canonicalAssetId: "wrapped-bitcoin",
    coingeckoId: "coinbase-wrapped-btc",
  },
  {
    chainId: base.id,
    symbol: "EURC",
    name: "Euro Coin",
    address: "0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42",
    decimals: 6,
    isStablecoin: true,
    canonicalAssetId: "euro-coin",
    coingeckoId: "euro-coin",
  },
] as const;

export const ARBITRUM_TOKENS: readonly TrackedToken[] = [
  {
    chainId: arbitrum.id,
    symbol: "ETH",
    name: "Ether",
    address: "0x0000000000000000000000000000000000000000",
    decimals: 18,
    isNative: true,
    canonicalAssetId: "ethereum",
    coingeckoId: "ethereum",
  },
  {
    chainId: arbitrum.id,
    symbol: "USDC",
    name: "USD Coin",
    address: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
    decimals: 6,
    isStablecoin: true,
    assetId: "nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near",
    canonicalAssetId: "usd-coin",
    coingeckoId: "usd-coin",
  },
  {
    chainId: arbitrum.id,
    symbol: "WETH",
    name: "Wrapped Ether",
    address: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
    decimals: 18,
    canonicalAssetId: "ethereum",
    coingeckoId: "ethereum",
  },
  {
    chainId: arbitrum.id,
    symbol: "WBTC",
    name: "Wrapped BTC",
    address: "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f",
    decimals: 8,
    canonicalAssetId: "wrapped-bitcoin",
    coingeckoId: "wrapped-bitcoin",
  },
  {
    chainId: arbitrum.id,
    symbol: "EURC",
    name: "Euro Coin",
    address: "0xfa5ff776c545041a029a886f4a86776101c51859",
    decimals: 6,
    isStablecoin: true,
    canonicalAssetId: "euro-coin",
    coingeckoId: "euro-coin",
  },
] as const;

export const SUPPORTED_CHAINS: readonly SupportedChain[] = [
  {
    id: base.id,
    slug: "base",
    name: "Base",
    oneClickBlockchain: "base",
    explorerUrl: "https://basescan.org",
    usdc: {
      symbol: "USDC",
      address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
      decimals: 6,
    },
    rpcUrl: env.RPC_URL_BASE ?? "https://mainnet.base.org",
    fallbackRpcUrls: [
      env.RPC_URL_BASE ?? "https://mainnet.base.org",
      "https://base.llamarpc.com",
      "https://base-rpc.publicnode.com",
    ],
    tokens: BASE_TOKENS,
  },
  {
    id: arbitrum.id,
    slug: "arbitrum",
    name: "Arbitrum One",
    oneClickBlockchain: "arb",
    explorerUrl: "https://arbiscan.io",
    usdc: {
      symbol: "USDC",
      address: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
      decimals: 6,
    },
    rpcUrl: env.RPC_URL_ARBITRUM ?? "https://arb1.arbitrum.io/rpc",
    fallbackRpcUrls: [
      env.RPC_URL_ARBITRUM ?? "https://arb1.arbitrum.io/rpc",
      "https://arbitrum.llamarpc.com",
      "https://arbitrum-one-rpc.publicnode.com",
    ],
    tokens: ARBITRUM_TOKENS,
  },
] as const;

export function getChain(chainId: number): SupportedChain | undefined {
  return SUPPORTED_CHAINS.find((c) => c.id === chainId);
}

export function getChainBySlug(slug: string): SupportedChain | undefined {
  return SUPPORTED_CHAINS.find((c) => c.slug === slug);
}

/** viem chain config with our RPC override applied. */
export function toViemChain(chain: SupportedChain) {
  const viemChain = chain.id === base.id ? base : arbitrum;
  return {
    ...viemChain,
    rpcUrls: {
      ...viemChain.rpcUrls,
      default: { http: [chain.rpcUrl, ...chain.fallbackRpcUrls] },
    },
  };
}
