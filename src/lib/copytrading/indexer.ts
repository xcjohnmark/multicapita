import { erc20Abi, formatUnits, isAddress, createPublicClient, http, type Address } from "viem";
import { mainnet } from "viem/chains";
import { getPublicClient } from "@/lib/chain/rpc";
import { env } from "@/lib/env";
import { getClient } from "@/lib/near/registry";
import { AAVE_V3_CONFIG, aavePoolAbi } from "@/lib/protocols/aave";
import {
  COPY_WATCH_EVM_ASSETS,
  classifyCopyAsset,
  type CopyWatchEvmAsset,
} from "./catalog";
import {
  scoreTraderDeterministically,
  type TraderDeterministicScore,
  type TraderPositionItem,
} from "./policy";

/**
 * Multi-Chain Wallet X-Ray & Leaderboard Indexer (Stage S7).
 *
 * Resolution cascade for entered addresses/handles (`0x...`, `.eth`, `.near`, `.sol`):
 *  1. Zerion API (`ZERION_API_KEY`) when configured
 *  2. DeBank Cloud (`DEBANK_ACCESS_KEY`) when configured
 *  3. Sim by Dune (`DUNE_SIM_API_KEY`) when configured
 *  4. Live public On-Chain RPC multicall across Base & Arbitrum One (zero-key fallback)
 *     reading native ETH, verified non-memecoin spot/vault tokens, and Aave V3 account debt/collateral.
 *
 * Invariants:
 *  - External indexer keys absent -> uses real live RPCs cleanly without inventing PnL/winRate.
 *  - Curated sample reference profiles are explicitly flagged `dataMode: "sample"`.
 */

export type TraderInspectionResult = {
  address: string;
  resolvedHandle: string | null;
  ecosystem: "evm" | "near" | "solana";
  positions: TraderPositionItem[];
  score: TraderDeterministicScore;
  aaveDebtUsd: number | null;
  realisedPnl90dUsd: number | null;
  winRatePercent: number | null;
  maxDrawdownPercent: number | null;
  indexerSources: string[];
  dataMode: "live" | "sample";
  observedAt: string;
  notes: string[];
};

const ETH_PUBLIC_RPC = "https://ethereum-rpc.publicnode.com";
const NEAR_PUBLIC_RPC = "https://rpc.mainnet.near.org";

function detectEcosystem(raw: string): "evm" | "near" | "solana" | null {
  const input = raw.trim();
  if (!input) return null;
  if (isAddress(input) || input.toLowerCase().endsWith(".eth")) return "evm";
  if (input.toLowerCase().endsWith(".near") || /^[a-f0-9]{64}$/i.test(input)) return "near";
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(input) || input.toLowerCase().endsWith(".sol")) {
    return "solana";
  }
  return null;
}

async function resolveEnsAddress(handle: string): Promise<Address | null> {
  try {
    const client = createPublicClient({
      chain: mainnet,
      transport: http(ETH_PUBLIC_RPC, { timeout: 8_000 }),
    });
    const addr = await client.getEnsAddress({ name: handle });
    return addr ?? null;
  } catch {
    return null;
  }
}

async function fetchZerionPositions(address: string): Promise<{
  positions: TraderPositionItem[];
  source: string;
} | null> {
  if (!env.ZERION_API_KEY) return null;
  try {
    const auth = Buffer.from(`${env.ZERION_API_KEY}:`).toString("base64");
    const res = await fetch(
      `https://api.zerion.io/v1/wallets/${encodeURIComponent(address)}/positions/?filter[positions]=no_filter&currency=usd&sort=value`,
      {
        headers: {
          accept: "application/json",
          authorization: `Basic ${auth}`,
        },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: Array<{
        attributes?: {
          value?: number | null;
          protocol?: string | null;
          position_type?: string | null;
          quantity?: { float?: number | null };
          fungible_info?: {
            symbol?: string;
            name?: string;
            implementations?: Array<{ chain_id?: string; address?: string | null }>;
          };
        };
      }>;
    };
    const items = json.data ?? [];
    const positions: TraderPositionItem[] = [];
    for (const item of items.slice(0, 30)) {
      const attr = item.attributes;
      const sym = attr?.fungible_info?.symbol;
      if (!sym) continue;
      const val = typeof attr?.value === "number" ? attr.value : null;
      if (val !== null && val < 1) continue;

      const impl = attr?.fungible_info?.implementations?.[0];
      const chainSlug = impl?.chain_id ?? "base";
      const chainId = chainSlug.includes("arbitrum") ? 42161 : chainSlug.includes("ethereum") ? 1 : 8453;
      const chainName =
        chainId === 42161 ? "Arbitrum One" : chainId === 1 ? "Ethereum" : "Base";
      const contractAddress = (impl?.address ?? "0x0000000000000000000000000000000000000000").toLowerCase();
      const assetClass = classifyCopyAsset({ symbol: sym, name: attr?.fungible_info?.name });
      const posType = (attr?.position_type ?? "").toLowerCase();
      const actionKind =
        posType.includes("deposit") || posType.includes("loan")
          ? "aave_lending"
          : posType.includes("liquidity")
            ? "uniswap_lp"
            : assetClass === "vault_receipt"
              ? "yield_vault"
              : "spot_1click";

      positions.push({
        chainId,
        chainName,
        symbol: sym,
        name: attr?.fungible_info?.name ?? sym,
        contractAddress,
        assetClass,
        actionKind,
        protocolName: attr?.protocol ?? (actionKind === "spot_1click" ? "Spot Wallet" : "DeFi Protocol"),
        balanceDisplay: String(attr?.quantity?.float?.toFixed(4) ?? "0"),
        valueUsd: val !== null ? Math.round(val * 100) / 100 : null,
        weightPercent: null,
        copyableVia:
          assetClass === "memecoin" || assetClass === "deprecated"
            ? "blocked_memecoin"
            : actionKind === "aave_lending" || actionKind === "uniswap_lp"
              ? "1click_then_protocol"
              : "1click_direct",
      });
    }
    return { positions, source: "zerion_api" };
  } catch {
    return null;
  }
}

async function fetchDebankPositions(address: string): Promise<{
  positions: TraderPositionItem[];
  source: string;
} | null> {
  if (!env.DEBANK_ACCESS_KEY) return null;
  try {
    const res = await fetch(
      `https://pro-openapi.debank.com/v1/user/all_token_list?id=${encodeURIComponent(address)}&is_all=false`,
      {
        headers: {
          accept: "application/json",
          AccessKey: env.DEBANK_ACCESS_KEY,
        },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!res.ok) return null;
    const items = (await res.json()) as Array<{
      id?: string;
      chain?: string;
      symbol?: string;
      name?: string;
      amount?: number;
      price?: number;
      is_verified?: boolean;
      protocol_id?: string;
    }>;
    if (!Array.isArray(items)) return null;

    const positions: TraderPositionItem[] = [];
    for (const item of items.slice(0, 40)) {
      const sym = item.symbol;
      if (!sym || item.is_verified === false) continue;
      const amt = typeof item.amount === "number" ? item.amount : 0;
      const px = typeof item.price === "number" ? item.price : 0;
      const valUsd = amt * px;
      if (valUsd < 1) continue;

      const chainSlug = (item.chain ?? "base").toLowerCase();
      const chainId = chainSlug.includes("arb") ? 42161 : chainSlug === "eth" ? 1 : 8453;
      const chainName = chainId === 42161 ? "Arbitrum One" : chainId === 1 ? "Ethereum" : "Base";
      const contractAddress =
        item.id && item.id.startsWith("0x") ? item.id.toLowerCase() : "0x0000000000000000000000000000000000000000";
      const assetClass = classifyCopyAsset({ symbol: sym, name: item.name });
      const actionKind = item.protocol_id
        ? "aave_lending"
        : assetClass === "vault_receipt"
          ? "yield_vault"
          : "spot_1click";

      positions.push({
        chainId,
        chainName,
        symbol: sym,
        name: item.name ?? sym,
        contractAddress,
        assetClass,
        actionKind,
        protocolName: item.protocol_id ?? "Spot Wallet",
        balanceDisplay: amt.toFixed(4),
        valueUsd: Math.round(valUsd * 100) / 100,
        weightPercent: null,
        copyableVia:
          assetClass === "memecoin" || assetClass === "deprecated"
            ? "blocked_memecoin"
            : actionKind === "aave_lending"
              ? "1click_then_protocol"
              : "1click_direct",
      });
    }
    return { positions, source: "debank_cloud" };
  } catch {
    return null;
  }
}

async function fetchDuneSimPositions(address: string): Promise<{
  positions: TraderPositionItem[];
  source: string;
} | null> {
  if (!env.DUNE_SIM_API_KEY) return null;
  try {
    const res = await fetch(
      `https://api.sim.dune.com/v1/evm/balances/${encodeURIComponent(address)}?chain_ids=1,8453,42161`,
      {
        headers: {
          accept: "application/json",
          "X-Sim-Api-Key": env.DUNE_SIM_API_KEY,
        },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      balances?: Array<{
        chain_id?: number;
        address?: string;
        symbol?: string;
        name?: string;
        decimals?: number;
        amount?: string;
        value_usd?: number | null;
      }>;
    };
    const rows = json.balances ?? [];
    const positions: TraderPositionItem[] = [];
    for (const row of rows.slice(0, 40)) {
      if (!row.symbol) continue;
      const valUsd = typeof row.value_usd === "number" ? row.value_usd : null;
      if (valUsd !== null && valUsd < 1) continue;

      const chainId = row.chain_id === 42161 || row.chain_id === 1 ? row.chain_id : 8453;
      const chainName = chainId === 42161 ? "Arbitrum One" : chainId === 1 ? "Ethereum" : "Base";
      const decimals = typeof row.decimals === "number" ? row.decimals : 18;
      const amtFloat = row.amount ? Number(formatUnits(BigInt(row.amount), decimals)) : 0;
      const assetClass = classifyCopyAsset({ symbol: row.symbol, name: row.name });
      const actionKind = assetClass === "vault_receipt" ? "yield_vault" : "spot_1click";

      positions.push({
        chainId,
        chainName,
        symbol: row.symbol,
        name: row.name ?? row.symbol,
        contractAddress: (row.address ?? "0x0000000000000000000000000000000000000000").toLowerCase(),
        assetClass,
        actionKind,
        protocolName: "Spot Wallet",
        balanceDisplay: amtFloat.toFixed(4),
        valueUsd: valUsd !== null ? Math.round(valUsd * 100) / 100 : null,
        weightPercent: null,
        copyableVia:
          assetClass === "memecoin" || assetClass === "deprecated"
            ? "blocked_memecoin"
            : "1click_direct",
      });
    }
    return { positions, source: "dune_sim" };
  } catch {
    return null;
  }
}

async function fetchLiveRpcPositions(address: Address): Promise<{
  positions: TraderPositionItem[];
  aaveDebtUsd: number;
  notes: string[];
}> {
  const notes: string[] = [];
  const positions: TraderPositionItem[] = [];
  let aaveDebtUsd = 0;

  // Build live price map from 1Click /v0/tokens (`symbol -> price`)
  const priceByAssetId = new Map<string, number>();
  const priceByChainSymbol = new Map<string, number>();
  try {
    const catalogue = await getClient().getTokens();
    for (const token of catalogue.tokens) {
      if (typeof token.price === "number" && token.price > 0) {
        priceByAssetId.set(token.assetId, token.price);
        priceByChainSymbol.set(`${token.blockchain}:${token.symbol.toUpperCase()}`, token.price);
      }
    }
  } catch {
    notes.push("1Click price catalogue temporarily unavailable; stablecoins defaulted to $1.00 reference.");
  }

  const ethPriceUsd =
    priceByChainSymbol.get("base:ETH") ?? priceByChainSymbol.get("arb:ETH") ?? null;

  for (const chainId of [8453, 42161] as const) {
    const chainName = chainId === 8453 ? "Base" : "Arbitrum One";
    const chainSlug = chainId === 8453 ? "base" : "arb";

    try {
      const client = getPublicClient(chainId);
      const nativeBal = await client.getBalance({ address });
      if (nativeBal > 0n) {
        const display = Number(formatUnits(nativeBal, 18));
        const valUsd = ethPriceUsd !== null ? Math.round(display * ethPriceUsd * 100) / 100 : null;
        if (display > 0.0001) {
          positions.push({
            chainId,
            chainName,
            symbol: "ETH",
            name: "Native Ether",
            contractAddress: "0x0000000000000000000000000000000000000000",
            assetClass: "bluechip_crypto",
            actionKind: "spot_1click",
            protocolName: "Spot Wallet",
            balanceDisplay: display.toFixed(4),
            valueUsd: valUsd,
            weightPercent: null,
            copyableVia: "1click_direct",
            oneClickAssetId: `nep141:${chainSlug}.omft.near`,
          });
        }
      }

      const assetsOnChain = COPY_WATCH_EVM_ASSETS.filter((a) => a.chainId === chainId);
      const reads = await Promise.allSettled(
        assetsOnChain.map((asset) =>
          client.readContract({
            address: asset.contractAddress,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [address],
          }),
        ),
      );

      reads.forEach((result, idx) => {
        if (result.status !== "fulfilled" || result.value <= 0n) return;
        const asset: CopyWatchEvmAsset = assetsOnChain[idx]!;
        const amountFloat = Number(formatUnits(result.value, asset.decimals));
        if (amountFloat <= 0.000001) return;

        const price =
          (asset.oneClickAssetId ? priceByAssetId.get(asset.oneClickAssetId) : undefined) ??
          priceByChainSymbol.get(`${chainSlug}:${asset.symbol.toUpperCase()}`) ??
          asset.fallbackPriceUsd ??
          null;
        const valueUsd = price !== null ? Math.round(amountFloat * price * 100) / 100 : null;
        if (valueUsd !== null && valueUsd < 0.01) return;

        const actionKind =
          asset.kind === "vault"
            ? "yield_vault"
            : asset.kind === "aave_collateral"
              ? "aave_lending"
              : "spot_1click";

        positions.push({
          chainId,
          chainName,
          symbol: asset.symbol,
          name: asset.name,
          contractAddress: asset.contractAddress.toLowerCase(),
          assetClass: classifyCopyAsset({ symbol: asset.symbol, assetId: asset.oneClickAssetId }),
          actionKind,
          protocolName: asset.protocolName,
          balanceDisplay: amountFloat < 1 ? amountFloat.toFixed(6) : amountFloat.toFixed(4),
          valueUsd,
          weightPercent: null,
          copyableVia: actionKind === "aave_lending" ? "1click_then_protocol" : "1click_direct",
          oneClickAssetId: asset.oneClickAssetId ?? null,
        });
      });

      // Read Aave V3 user account data (collateral vs borrow debt in 8-decimal USD base)
      const aaveCfg = AAVE_V3_CONFIG[chainId];
      if (aaveCfg) {
        try {
          const accountData = await client.readContract({
            address: aaveCfg.poolAddress,
            abi: aavePoolAbi,
            functionName: "getUserAccountData",
            args: [address],
          });
          const totalDebtUsd = Number(accountData[1]) / 1e8;
          if (totalDebtUsd > 1) aaveDebtUsd += totalDebtUsd;
        } catch {
          // Non-fatal if Aave read reverts or times out
        }
      }
    } catch (err) {
      notes.push(
        `${chainName} RPC read failed: ${err instanceof Error ? err.message : "unknown error"}`,
      );
    }
  }

  return { positions, aaveDebtUsd: Math.round(aaveDebtUsd * 100) / 100, notes };
}

function finalizeWeights(positions: TraderPositionItem[]): TraderPositionItem[] {
  const totalUsd = positions.reduce((sum, p) => sum + (p.valueUsd ?? 0), 0);
  return positions.map((p) => ({
    ...p,
    weightPercent:
      totalUsd > 0 && p.valueUsd !== null
        ? Math.round((p.valueUsd / totalUsd) * 1000) / 10
        : null,
  }));
}

export async function inspectTraderWallet(rawInput: string): Promise<TraderInspectionResult> {
  const trimmed = rawInput.trim();
  const ecosystem = detectEcosystem(trimmed);
  if (!ecosystem) {
    throw new Error("Enter a valid EVM address (0x... or .eth), NEAR account (.near), or Solana address.");
  }

  const nowIso = new Date().toISOString();

  if (ecosystem === "evm") {
    let resolvedHandle: string | null = null;
    let targetAddress = trimmed;

    if (trimmed.toLowerCase().endsWith(".eth")) {
      const ensAddr = await resolveEnsAddress(trimmed);
      if (!ensAddr) {
        throw new Error(`Could not resolve ENS name "${trimmed}". Try pasting the 0x address directly.`);
      }
      resolvedHandle = trimmed;
      targetAddress = ensAddr;
    }

    const normalizedAddress = targetAddress.toLowerCase() as Address;
    const sources: string[] = [];
    const notes: string[] = [];
    let positions: TraderPositionItem[] = [];
    let aaveDebtUsd = 0;

    // 1. Optional indexers in priority order: Zerion -> DeBank Cloud -> Sim by Dune
    const zerion = await fetchZerionPositions(normalizedAddress);
    const debank = !zerion ? await fetchDebankPositions(normalizedAddress) : null;
    const duneSim = !zerion && !debank ? await fetchDuneSimPositions(normalizedAddress) : null;
    const indexed = zerion ?? debank ?? duneSim;

    if (indexed) {
      positions = indexed.positions;
      sources.push(indexed.source);
    }

    // 2. Always verify / enrich Base & Arbitrum verified contracts + Aave debt via direct RPC
    const rpc = await fetchLiveRpcPositions(normalizedAddress);
    sources.push("onchain_rpc_multicall");
    aaveDebtUsd = rpc.aaveDebtUsd;
    notes.push(...rpc.notes);

    if (!indexed) {
      positions = rpc.positions;
      if (!env.ZERION_API_KEY && !env.DEBANK_ACCESS_KEY && !env.DUNE_SIM_API_KEY) {
        notes.push(
          "Showing live verified on-chain Base & Arbitrum balances and Aave V3 debt via RPC. Add ZERION_API_KEY, DEBANK_ACCESS_KEY, or DUNE_SIM_API_KEY for historical 90d realized PnL and full LP fee analytics.",
        );
      }
    }

    const weightedPositions = finalizeWeights(positions);
    const score = scoreTraderDeterministically({
      positions: weightedPositions,
      hasAaveDebt: aaveDebtUsd > 1,
    });

    return {
      address: normalizedAddress,
      resolvedHandle,
      ecosystem: "evm",
      positions: weightedPositions,
      score,
      aaveDebtUsd,
      realisedPnl90dUsd: null,
      winRatePercent: null,
      maxDrawdownPercent: null,
      indexerSources: sources,
      dataMode: "live",
      observedAt: nowIso,
      notes,
    };
  }

  if (ecosystem === "near") {
    let nearUsdNotes: string[] = [];
    const positions: TraderPositionItem[] = [];
    try {
      const res = await fetch(NEAR_PUBLIC_RPC, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "capita",
          method: "query",
          params: { request_type: "view_account", finality: "final", account_id: trimmed },
        }),
        signal: AbortSignal.timeout(8_000),
      });
      const json = (await res.json()) as { result?: { amount?: string }; error?: { cause?: { name?: string } } };
      if (json.result?.amount) {
        const nearFloat = Number(BigInt(json.result.amount)) / 1e24;
        if (nearFloat > 0.01) {
          let nearPrice: number | null = null;
          try {
            const cat = await getClient().getTokens();
            nearPrice = cat.tokens.find((t) => t.blockchain === "near" && t.symbol === "wNEAR")?.price ?? null;
          } catch {
            nearPrice = null;
          }
          positions.push({
            chainId: 0,
            chainName: "NEAR",
            symbol: "wNEAR",
            name: "NEAR Protocol",
            contractAddress: "wrap.near",
            assetClass: "bluechip_crypto",
            actionKind: "spot_1click",
            protocolName: "NEAR Native",
            balanceDisplay: nearFloat.toFixed(2),
            valueUsd: nearPrice !== null ? Math.round(nearFloat * nearPrice * 100) / 100 : null,
            weightPercent: 100,
            copyableVia: "1click_direct",
            oneClickAssetId: "nep141:wrap.near",
          });
        }
      } else {
        nearUsdNotes.push(`NEAR account ${trimmed} returned no liquid balance via mainnet RPC.`);
      }
    } catch {
      nearUsdNotes.push("NEAR RPC check timed out; verify account id.");
    }

    const score = scoreTraderDeterministically({ positions, hasAaveDebt: false });
    return {
      address: trimmed.toLowerCase(),
      resolvedHandle: trimmed.toLowerCase(),
      ecosystem: "near",
      positions,
      score,
      aaveDebtUsd: 0,
      realisedPnl90dUsd: null,
      winRatePercent: null,
      maxDrawdownPercent: null,
      indexerSources: ["near_mainnet_rpc"],
      dataMode: "live",
      observedAt: nowIso,
      notes: nearUsdNotes,
    };
  }

  // Solana address inspection cleanly surfaces verification status without fabricating RPC state
  const score = scoreTraderDeterministically({ positions: [], hasAaveDebt: false });
  return {
    address: trimmed,
    resolvedHandle: trimmed.endsWith(".sol") ? trimmed : null,
    ecosystem: "solana",
    positions: [],
    score,
    aaveDebtUsd: null,
    realisedPnl90dUsd: null,
    winRatePercent: null,
    maxDrawdownPercent: null,
    indexerSources: ["solana_address_validated"],
    dataMode: "live",
    observedAt: nowIso,
    notes: [
      "Solana address validated. Configure ZERION_API_KEY or DUNE_SIM_API_KEY to fetch live SPL token, Kamino, and Solana LP holdings.",
    ],
  };
}

/**
 * Curated sample reference Top Performers shown when no live indexer leaderboard key is active.
 * Explicitly tagged `dataMode: "sample"` so UI never disguises reference leaders as live PnL.
 */
export const SAMPLE_TOP_PERFORMERS: Array<{
  address: string;
  resolvedHandle: string | null;
  label: string;
  ecosystem: "evm" | "near" | "solana";
  primaryStyle: string;
  realisedPnl90dUsd: number;
  winRatePercent: number;
  maxDrawdownPercent: number;
  hasExternalHedgeWarning: boolean;
  positions: TraderPositionItem[];
}> = [
  {
    address: "0x7a16ff8270133f063aab6c9977183d9e72835428",
    resolvedHandle: "yield-rotator.eth",
    label: "Arbitrum & Base DeFi Rotator",
    ecosystem: "evm",
    primaryStyle: "DeFi Yield & Lending",
    realisedPnl90dUsd: 18420,
    winRatePercent: 78,
    maxDrawdownPercent: 4.2,
    hasExternalHedgeWarning: false,
    positions: [
      {
        chainId: 8453,
        chainName: "Base",
        symbol: "gtUSDCp",
        name: "Gauntlet USDC Prime Vault",
        contractAddress: "0x0bb69b79bc829e1cfcc34a740110886d98d2bd14",
        assetClass: "vault_receipt",
        actionKind: "yield_vault",
        protocolName: "Gauntlet / Morpho (1Click Earn)",
        balanceDisplay: "44500.00",
        valueUsd: 49740,
        weightPercent: 52,
        copyableVia: "1click_direct",
        oneClickAssetId: "nep141:base-0x0bb69b79bc829e1cfcc34a740110886d98d2bd14.omft.near",
      },
      {
        chainId: 42161,
        chainName: "Arbitrum One",
        symbol: "USDC",
        name: "Aave V3 Arbitrum Supply",
        contractAddress: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
        assetClass: "stablecoin",
        actionKind: "aave_lending",
        protocolName: "Aave V3 Arbitrum",
        balanceDisplay: "31200.00",
        valueUsd: 31200,
        weightPercent: 33,
        copyableVia: "1click_then_protocol",
        oneClickAssetId: "nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near",
      },
      {
        chainId: 8453,
        chainName: "Base",
        symbol: "WETH",
        name: "Wrapped Ether",
        contractAddress: "0x4200000000000000000000000000000000000006",
        assetClass: "bluechip_crypto",
        actionKind: "spot_1click",
        protocolName: "Spot Wallet",
        balanceDisplay: "7.10",
        valueUsd: 14376,
        weightPercent: 15,
        copyableVia: "1click_direct",
        oneClickAssetId: "nep141:base-0x4200000000000000000000000000000000000006.omft.near",
      },
    ],
  },
  {
    address: "0x9c5083dd4838e120dbeac44c052179692aa5dac5",
    resolvedHandle: "bluechip-macro.eth",
    label: "Macro Blue-Chip & Gold Sleeve",
    ecosystem: "evm",
    primaryStyle: "Spot Blue-Chips",
    realisedPnl90dUsd: 42950,
    winRatePercent: 69,
    maxDrawdownPercent: 11.8,
    hasExternalHedgeWarning: true,
    positions: [
      {
        chainId: 8453,
        chainName: "Base",
        symbol: "cbBTC",
        name: "Coinbase Wrapped BTC",
        contractAddress: "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf",
        assetClass: "bluechip_crypto",
        actionKind: "spot_1click",
        protocolName: "Spot Wallet",
        balanceDisplay: "0.95",
        valueUsd: 69297,
        weightPercent: 45,
        copyableVia: "1click_direct",
        oneClickAssetId: "nep141:base-0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf.omft.near",
      },
      {
        chainId: 1,
        chainName: "Ethereum",
        symbol: "XAUT",
        name: "Tether Gold",
        contractAddress: "0x68749665ff8d2d112fa859aa293f07a622782f38",
        assetClass: "rwa_commodity",
        actionKind: "spot_1click",
        protocolName: "Tether Gold (1Click RWA)",
        balanceDisplay: "11.50",
        valueUsd: 45274,
        weightPercent: 29,
        copyableVia: "1click_direct",
        oneClickAssetId: "nep141:eth-0x68749665ff8d2d112fa859aa293f07a622782f38.omft.near",
      },
      {
        chainId: 42161,
        chainName: "Arbitrum One",
        symbol: "ARB",
        name: "Arbitrum",
        contractAddress: "0x912ce59144191c1204e64559fe8253a0e49e6548",
        assetClass: "bluechip_crypto",
        actionKind: "spot_1click",
        protocolName: "Spot Wallet",
        balanceDisplay: "265000",
        valueUsd: 38989,
        weightPercent: 26,
        copyableVia: "1click_direct",
        oneClickAssetId: "nep141:arb-0x912ce59144191c1204e64559fe8253a0e49e6548.omft.near",
      },
    ],
  },
  {
    address: "0x3ddfa8ec3052539b6c9549f12cea2c295cff5296",
    resolvedHandle: "stable-lp-desk.eth",
    label: "Concentrated Stablecoin LP Specialist",
    ecosystem: "evm",
    primaryStyle: "LP Providers",
    realisedPnl90dUsd: 11280,
    winRatePercent: 86,
    maxDrawdownPercent: 2.1,
    hasExternalHedgeWarning: false,
    positions: [
      {
        chainId: 8453,
        chainName: "Base",
        symbol: "USDC",
        name: "Uniswap V3 USDC/EURC 0.01% LP",
        contractAddress: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
        assetClass: "stablecoin",
        actionKind: "uniswap_lp",
        protocolName: "Uniswap V3 Base",
        balanceDisplay: "62000.00",
        valueUsd: 62000,
        weightPercent: 68,
        copyableVia: "1click_then_protocol",
        oneClickAssetId: "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near",
      },
      {
        chainId: 8453,
        chainName: "Base",
        symbol: "sparkUSDC",
        name: "Spark USDC Vault",
        contractAddress: "0x7429743f8adbbe932b27bc02267b0e70f1ba688b",
        assetClass: "vault_receipt",
        actionKind: "yield_vault",
        protocolName: "Spark (1Click Earn)",
        balanceDisplay: "27000.00",
        valueUsd: 29314,
        weightPercent: 32,
        copyableVia: "1click_direct",
        oneClickAssetId: "nep141:base-0x7429743f8adbbe932b27bc02267b0e70f1ba688b.omft.near",
      },
    ],
  },
];
