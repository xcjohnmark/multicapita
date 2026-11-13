import type { Address } from "viem";
import type { OneClickToken } from "@/lib/near/oneclick";
import { AAVE_V3_CONFIG } from "@/lib/protocols/aave";

/**
 * Verified non-memecoin asset catalogue & classifier for Stage S7 copytrading.
 *
 * Invariants:
 *  - Token identity is `(chainId / blockchain, contractAddress)`, never ticker symbol alone.
 *  - Memecoins are explicitly identified and excluded across all copytrading discovery and
 *    execution paths (`noMemecoinsOnly`).
 *  - Vault receipt tokens (`gtUSDCp`, `sparkUSDC`, `mwUSDC`, `steakUSDC`, `kV-gtSOLb`) and
 *    major verified spot assets settle cleanly via NEAR Intents 1Click.
 */

export type CopyAssetClass =
  | "bluechip_crypto"
  | "stablecoin"
  | "vault_receipt"
  | "rwa_commodity"
  | "memecoin"
  | "deprecated";

const MEMECOIN_SYMBOLS = new Set([
  "SHIB",
  "PEPE",
  "DOGE",
  "WIF",
  "$WIF",
  "BOME",
  "TRUMP",
  "MELANIA",
  "BRETT",
  "MOG",
  "TURBO",
  "SPX",
  "PENGU",
  "SHITZU",
  "BLACKDRAGON",
  "ABG",
  "NOEAR",
  "JAMBO",
  "NEARKAT",
  "WNEARKAT",
  "GNEAR",
  "PURGE",
  "LOUD",
  "CASHCAT",
  "TESTNEBULA",
  "STJACK",
  "KAT",
  "BONK",
  "FLOKI",
  "POPCAT",
  "PNUT",
]);

const STABLECOIN_SYMBOLS = new Set([
  "USDC",
  "USDT",
  "USDT0",
  "DAI",
  "FRAX",
  "XDAI",
  "EURE",
  "GBPE",
  "EURC",
  "USD1",
  "USDF",
  "USDE",
  "USDG",
  "USAD",
  "USDCX",
  "SUSDC",
  "NRUSDT",
]);

const VAULT_RECEIPT_SYMBOLS = new Set([
  "GTUSDCP",
  "SPARKUSDC",
  "MWUSDC",
  "LAUSDC",
  "STEAKUSDC",
  "KV-GTSOLB",
  "WSTETH",
  "STNEAR",
  "CNEAR",
]);

const RWA_COMMODITY_SYMBOLS = new Set(["XAUT", "PAXG"]);

export function isMemecoinToken(input: {
  symbol: string;
  assetId?: string | null;
  name?: string | null;
}): boolean {
  const sym = input.symbol.trim().toUpperCase();
  if (MEMECOIN_SYMBOLS.has(sym)) return true;

  const idLower = (input.assetId ?? "").toLowerCase();
  if (idLower.includes("meme-cooking") || idLower.includes("shitzu") || idLower.includes("blackdragon")) {
    return true;
  }

  const nameLower = (input.name ?? "").toLowerCase();
  if (/\bmeme(coin)?\b/.test(nameLower)) return true;

  return false;
}

export function classifyCopyAsset(input: {
  symbol: string;
  assetId?: string | null;
  name?: string | null;
}): CopyAssetClass {
  const symUpper = input.symbol.trim().toUpperCase();
  if (symUpper.includes("DEPRECATED") || symUpper.startsWith("TEST")) return "deprecated";
  if (isMemecoinToken(input)) return "memecoin";
  if (VAULT_RECEIPT_SYMBOLS.has(symUpper)) return "vault_receipt";
  if (RWA_COMMODITY_SYMBOLS.has(symUpper)) return "rwa_commodity";
  if (STABLECOIN_SYMBOLS.has(symUpper)) return "stablecoin";
  return "bluechip_crypto";
}

export function isCopyableNonMemeOneClickToken(token: OneClickToken): boolean {
  const assetClass = classifyCopyAsset({ symbol: token.symbol, assetId: token.assetId });
  if (assetClass === "memecoin" || assetClass === "deprecated") return false;
  if (typeof token.price === "number" && token.price <= 0) return false;
  return true;
}

export function filterCopyableOneClickTokens(tokens: OneClickToken[]): OneClickToken[] {
  return tokens.filter(isCopyableNonMemeOneClickToken);
}

export type CopyWatchEvmAsset = {
  chainId: number;
  chainName: string;
  symbol: string;
  name: string;
  contractAddress: Address;
  decimals: number;
  kind: "spot" | "vault" | "aave_collateral";
  protocolName: string;
  oneClickAssetId?: string;
  fallbackPriceUsd?: number;
};

/**
 * Verified EVM asset contracts queried directly by live RPC multicall during Wallet X-Ray.
 * Identity is strictly `(chainId, contractAddress)`.
 */
export const COPY_WATCH_EVM_ASSETS: CopyWatchEvmAsset[] = [
  // Base (8453)
  {
    chainId: 8453,
    chainName: "Base",
    symbol: "USDC",
    name: "USD Coin",
    contractAddress: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    decimals: 6,
    kind: "spot",
    protocolName: "Spot Wallet",
    oneClickAssetId: "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near",
    fallbackPriceUsd: 1,
  },
  {
    chainId: 8453,
    chainName: "Base",
    symbol: "WETH",
    name: "Wrapped Ether",
    contractAddress: "0x4200000000000000000000000000000000000006",
    decimals: 18,
    kind: "spot",
    protocolName: "Spot Wallet",
    oneClickAssetId: "nep141:base-0x4200000000000000000000000000000000000006.omft.near",
  },
  {
    chainId: 8453,
    chainName: "Base",
    symbol: "cbBTC",
    name: "Coinbase Wrapped BTC",
    contractAddress: "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf",
    decimals: 8,
    kind: "spot",
    protocolName: "Spot Wallet",
    oneClickAssetId: "nep141:base-0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf.omft.near",
  },
  {
    chainId: 8453,
    chainName: "Base",
    symbol: "gtUSDCp",
    name: "Gauntlet USDC Prime Vault",
    contractAddress: "0x0bb69b79bc829e1cfcc34a740110886d98d2bd14",
    decimals: 18,
    kind: "vault",
    protocolName: "Gauntlet / Morpho (1Click Earn)",
    oneClickAssetId: "nep141:base-0x0bb69b79bc829e1cfcc34a740110886d98d2bd14.omft.near",
  },
  {
    chainId: 8453,
    chainName: "Base",
    symbol: "sparkUSDC",
    name: "Spark USDC Vault",
    contractAddress: "0x7429743f8adbbe932b27bc02267b0e70f1ba688b",
    decimals: 18,
    kind: "vault",
    protocolName: "Spark (1Click Earn)",
    oneClickAssetId: "nep141:base-0x7429743f8adbbe932b27bc02267b0e70f1ba688b.omft.near",
  },
  {
    chainId: 8453,
    chainName: "Base",
    symbol: "mwUSDC",
    name: "Moonwell Flagship USDC Vault",
    contractAddress: "0x3388d158fdcc31398b99478420e6945cdaace009",
    decimals: 18,
    kind: "vault",
    protocolName: "Moonwell / Morpho (1Click Earn)",
    oneClickAssetId: "nep141:base-0x3388d158fdcc31398b99478420e6945cdaace009.omft.near",
  },
  {
    chainId: 8453,
    chainName: "Base",
    symbol: "aBasUSDC",
    name: "Aave Base USDC Supply",
    contractAddress: AAVE_V3_CONFIG[8453].aBasUsdcAddress,
    decimals: 6,
    kind: "aave_collateral",
    protocolName: "Aave V3 Base",
    fallbackPriceUsd: 1,
  },
  // Arbitrum One (42161)
  {
    chainId: 42161,
    chainName: "Arbitrum One",
    symbol: "USDC",
    name: "USD Coin",
    contractAddress: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
    decimals: 6,
    kind: "spot",
    protocolName: "Spot Wallet",
    oneClickAssetId: "nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near",
    fallbackPriceUsd: 1,
  },
  {
    chainId: 42161,
    chainName: "Arbitrum One",
    symbol: "WETH",
    name: "Wrapped Ether",
    contractAddress: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
    decimals: 18,
    kind: "spot",
    protocolName: "Spot Wallet",
    oneClickAssetId: "nep141:arb-0x82af49447d8a07e3bd95bd0d56f35241523fbab1.omft.near",
  },
  {
    chainId: 42161,
    chainName: "Arbitrum One",
    symbol: "ARB",
    name: "Arbitrum",
    contractAddress: "0x912ce59144191c1204e64559fe8253a0e49e6548",
    decimals: 18,
    kind: "spot",
    protocolName: "Spot Wallet",
    oneClickAssetId: "nep141:arb-0x912ce59144191c1204e64559fe8253a0e49e6548.omft.near",
  },
  {
    chainId: 42161,
    chainName: "Arbitrum One",
    symbol: "GMX",
    name: "GMX",
    contractAddress: "0xfc5a1a6eb076a2c7ad06ed22c90d7e710e35ad0a",
    decimals: 18,
    kind: "spot",
    protocolName: "Spot Wallet",
    oneClickAssetId: "nep141:arb-0xfc5a1a6eb076a2c7ad06ed22c90d7e710e35ad0a.omft.near",
  },
  {
    chainId: 42161,
    chainName: "Arbitrum One",
    symbol: "aArbUSDCn",
    name: "Aave Arbitrum USDC Supply",
    contractAddress: AAVE_V3_CONFIG[42161].aBasUsdcAddress,
    decimals: 6,
    kind: "aave_collateral",
    protocolName: "Aave V3 Arbitrum",
    fallbackPriceUsd: 1,
  },
];

export const COPYABLE_BLUECHIP_DEFAULTS = {
  nearUsdcAssetId: "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1",
  baseUsdcAssetId: "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near",
  arbitrumUsdcAssetId: "nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near",
} as const;
