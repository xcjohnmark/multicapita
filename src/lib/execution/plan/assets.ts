import type { Address } from "viem";
import { SUPPORTED_CHAINS, type TrackedToken } from "@/lib/chains";
import type { OneClickToken } from "@/lib/near/oneclick";

/**
 * Token identity for plans: `(chainId, contract address)`, never a ticker (AGENTS.md rule 4).
 * Native ETH uses the zero address, matching `src/lib/chains.ts`.
 */

export const NATIVE_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

/** 1Click `blockchain` code per EVM chain. Ethereum is a delivery target for tokenized stocks only. */
export const ONECLICK_BLOCKCHAIN: Record<number, string> = { 8453: "base", 42161: "arb", 1: "eth" };

/** USDC on Ethereum, the quote asset of the Ondo/Tether tokenized assets. */
export const ETHEREUM_USDC: TrackedToken = {
  chainId: 1,
  symbol: "USDC",
  name: "USD Coin",
  address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  decimals: 6,
  isStablecoin: true,
};

export function scopeTokens(): TrackedToken[] {
  return SUPPORTED_CHAINS.flatMap((chain) => [...chain.tokens]);
}

export function findTrackedToken(chainId: number, address: string): TrackedToken | null {
  const norm = address.toLowerCase();
  if (chainId === 1 && norm === ETHEREUM_USDC.address) return ETHEREUM_USDC;
  return scopeTokens().find((token) => token.chainId === chainId && token.address.toLowerCase() === norm) ?? null;
}

export function findTrackedTokenBySymbol(chainId: number, symbol: string): TrackedToken | null {
  const norm = symbol.toUpperCase();
  if (chainId === 1 && norm === "USDC") return ETHEREUM_USDC;
  return scopeTokens().find((token) => token.chainId === chainId && token.symbol.toUpperCase() === norm) ?? null;
}

export function usdcOn(chainId: number): TrackedToken | null {
  return findTrackedTokenBySymbol(chainId, "USDC");
}

/** Match a tracked token to its live 1Click catalogue entry by chain + contract. */
export function findCatalogueToken(
  catalogue: OneClickToken[],
  chainId: number,
  address: string,
): OneClickToken | null {
  const blockchain = ONECLICK_BLOCKCHAIN[chainId];
  if (!blockchain) return null;
  const norm = address.toLowerCase();
  if (norm === NATIVE_ADDRESS) {
    return catalogue.find((token) => token.blockchain === blockchain && !token.contractAddress) ?? null;
  }
  return (
    catalogue.find(
      (token) => token.blockchain === blockchain && token.contractAddress?.toLowerCase() === norm,
    ) ?? null
  );
}

export function isNative(address: string): boolean {
  return address.toLowerCase() === NATIVE_ADDRESS;
}

export function asAddress(value: string): Address {
  return value.toLowerCase() as Address;
}
