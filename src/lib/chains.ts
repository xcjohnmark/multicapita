import { arbitrum, base } from "viem/chains";

/**
 * MVP chain scope: Base (8453) and Arbitrum One (42161).
 * Both are in the live 1Click catalogue; both have USDC. USDT is NOT available on
 * either through 1Click, so stablecoin routes here are USDC-first.
 */

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
};

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
    rpcUrl: process.env.RPC_URL_BASE ?? "https://mainnet.base.org",
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
    rpcUrl: process.env.RPC_URL_ARBITRUM ?? "https://arb1.arbitrum.io/rpc",
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
      default: { http: [chain.rpcUrl] },
    },
  };
}
