import type { Address } from "viem";
import { AAVE_V3_CONFIG } from "@/lib/protocols/aave";
import {
  getMarketSessionStatus,
  getVerifiedEquityAsset,
  type EquityMarketSession,
  type TokenizedEquityAsset,
} from "@/lib/protocols/equities";
import { UNISWAP_V3_CONFIG, UNISWAP_V3_PAIRS } from "@/lib/protocols/uniswap";
import { ETHEREUM_USDC, findTrackedTokenBySymbol, usdcOn } from "./assets";
import type { ExitAction, TargetAction } from "./types";

/**
 * What an opportunity needs from a plan: which action, on which chain, with which asset and which
 * spender. Resolved from the opportunity row and the verified protocol configs; nothing here is
 * taken from a model or a free-text label without a matching config entry.
 */

export type OpportunityRow = {
  id: string;
  strategyType: string;
  chainId: number;
  tokenOrPairRef: string;
  marketOrPoolAddress: string | null;
  estimatedApy: number | null;
  status: string;
  dataMode: string;
  sourcePayload: unknown;
  protocol: { id: string; slug: string; name: string };
};

export type EntryTarget = {
  action: TargetAction;
  chainId: number;
  name: string;
  protocolSlug: string;
  protocolId: string;
  strategyType: string;
  asset: { symbol: string; decimals: number; address: Address };
  spender: Address | null;
  vaultAddress: Address | null;
  equity: TokenizedEquityAsset | null;
  ratePercent: number | null;
  marketSession: EquityMarketSession | null;
  isCommodity: boolean;
  tradedAsset: { symbol: string; decimals: number } | null;
  /** Chains the user may fund this from. */
  sourceChainIds: number[];
  /** Step(s) have no live builder: the plan can only be simulated. */
  simulationOnly: string | null;
  /** Why live execution is refused even when the deployment is live. */
  liveUnsupportedReason: string | null;
};

const FUNDING_CHAINS = [8453, 42161];

export function resolveEntryTarget(row: OpportunityRow): EntryTarget | { error: string } {
  const base = {
    chainId: row.chainId,
    protocolSlug: row.protocol.slug,
    protocolId: row.protocol.id,
    strategyType: row.strategyType,
    ratePercent: row.estimatedApy,
    marketSession: null,
    isCommodity: false,
    tradedAsset: null,
    vaultAddress: null,
    equity: null,
    sourceChainIds: FUNDING_CHAINS,
    simulationOnly: null,
    liveUnsupportedReason: null,
  } satisfies Partial<EntryTarget>;

  if (row.strategyType === "lending") {
    const symbol = /WETH/i.test(row.tokenOrPairRef) ? "WETH" : "USDC";
    const token = findTrackedTokenBySymbol(row.chainId, symbol);
    const aave = AAVE_V3_CONFIG[row.chainId];
    if (!token) return { error: `${symbol} is not tracked on this chain.` };
    return {
      ...base,
      action: "supply",
      name: row.protocol.name,
      asset: { symbol: token.symbol, decimals: token.decimals, address: token.address },
      spender: aave?.poolAddress ?? null,
      liveUnsupportedReason: aave ? null : "No verified Aave pool on this chain.",
    };
  }

  if (row.strategyType === "yield_vault") {
    const usdc = usdcOn(row.chainId);
    if (!usdc || !row.marketOrPoolAddress) return { error: "Vault address or USDC missing." };
    const vault = row.marketOrPoolAddress.toLowerCase() as Address;
    const receipt = row.tokenOrPairRef.split("→").pop()?.trim() || row.protocol.name;
    return {
      ...base,
      action: "vault_deposit",
      name: receipt,
      asset: { symbol: usdc.symbol, decimals: usdc.decimals, address: usdc.address },
      spender: vault,
      vaultAddress: vault,
    };
  }

  if (row.strategyType === "stablecoin_lp") {
    const usdc = usdcOn(row.chainId);
    if (!usdc) return { error: "USDC missing on this chain." };
    const isUniswap = row.protocol.slug.includes("uniswap") && Boolean(UNISWAP_V3_PAIRS[row.chainId]);
    return {
      ...base,
      action: "lp_mint",
      name: row.tokenOrPairRef,
      asset: { symbol: usdc.symbol, decimals: usdc.decimals, address: usdc.address },
      spender: isUniswap ? UNISWAP_V3_CONFIG[row.chainId].positionManager : null,
      liveUnsupportedReason:
        "Adding liquidity needs both tokens of the pair; a single-asset live entry isn't wired yet.",
    };
  }

  if (row.strategyType === "tokenized_equity") {
    const equity = row.marketOrPoolAddress ? getVerifiedEquityAsset(row.chainId, row.marketOrPoolAddress) : null;
    if (!equity) return { error: "This tokenized asset is not in the verified list." };
    const usdc = row.chainId === 1 ? ETHEREUM_USDC : usdcOn(row.chainId);
    if (!usdc) return { error: "USDC missing on this chain." };
    const isCommodity = equity.wrapperType === "physical_commodity";
    // The session is decided now, not from the stored sync payload: a stale row must not say "OPEN".
    const session = getMarketSessionStatus(new Date(), isCommodity);
    return {
      ...base,
      action: "equity_buy",
      name: equity.symbol,
      asset: { symbol: "USDC", decimals: usdc.decimals, address: usdc.address },
      spender: equity.swapRouterAddress,
      equity,
      ratePercent: null,
      marketSession: session,
      isCommodity,
      liveUnsupportedReason:
        row.chainId === 1 ? "Ethereum signing is outside the Base/Arbitrum execution scope." : null,
    };
  }

  if (row.strategyType === "arbitrage") {
    // Labels look like "WETH Base (Aerodrome) → Arbitrum (Uniswap)" or "WETH:USDC": the first word.
    const symbol = row.tokenOrPairRef.split(/[\s:]/)[0]?.trim() || "WETH";
    const buyChain = row.chainId;
    const sellChain = buyChain === 8453 ? 42161 : 8453;
    const usdc = usdcOn(buyChain);
    const traded = findTrackedTokenBySymbol(sellChain, symbol) ?? findTrackedTokenBySymbol(buyChain, symbol);
    if (!usdc) return { error: "USDC missing on this chain." };
    return {
      ...base,
      action: "arbitrage",
      chainId: sellChain,
      name: row.protocol.name,
      asset: { symbol: usdc.symbol, decimals: usdc.decimals, address: usdc.address },
      spender: null,
      ratePercent: null,
      tradedAsset: { symbol: traded?.symbol ?? symbol, decimals: traded?.decimals ?? 18 },
      sourceChainIds: [buyChain],
      simulationOnly: "Arbitrage runs as a simulation until a live two-leg path ships.",
      liveUnsupportedReason: "Arbitrage runs as a simulation until a live two-leg path ships.",
    };
  }

  return { error: `Unsupported strategy type ${row.strategyType}.` };
}

export type ExitTarget = {
  action: ExitAction;
  chainId: number;
  name: string;
  asset: { symbol: string; decimals: number; address: Address };
  /** Contract the asset is withdrawn from (pool / vault / router). */
  contract: Address | null;
  equity: TokenizedEquityAsset | null;
  simulationOnly: string | null;
  liveUnsupportedReason: string | null;
};

export function resolveExitTarget(position: {
  strategyType: string;
  chainId: number;
  positionReference: string;
  protocol: { slug: string; name: string };
}, mode: "withdraw" | "collect"): ExitTarget | { error: string } {
  const usdc = position.chainId === 1 ? ETHEREUM_USDC : usdcOn(position.chainId);
  if (!usdc) return { error: "USDC missing on this chain." };
  const asset = { symbol: usdc.symbol, decimals: usdc.decimals, address: usdc.address };
  const ref = position.positionReference;
  const refAddress = /^0x[a-fA-F0-9]{40}$/.test(ref) ? (ref.toLowerCase() as Address) : null;

  switch (position.strategyType) {
    case "lending": {
      const aave = AAVE_V3_CONFIG[position.chainId];
      return {
        action: "withdraw",
        chainId: position.chainId,
        name: position.protocol.name,
        asset,
        contract: aave?.poolAddress ?? null,
        equity: null,
        simulationOnly: null,
        liveUnsupportedReason: aave ? null : "No verified Aave pool on this chain.",
      };
    }
    case "yield_vault":
      return {
        action: "vault_redeem",
        chainId: position.chainId,
        name: position.protocol.name,
        asset,
        contract: refAddress,
        equity: null,
        simulationOnly: null,
        liveUnsupportedReason: refAddress ? null : "The vault address for this position is unknown.",
      };
    case "stablecoin_lp":
      return mode === "collect"
        ? {
            action: "lp_collect",
            chainId: position.chainId,
            name: position.protocol.name,
            asset,
            contract: UNISWAP_V3_CONFIG[position.chainId]?.positionManager ?? null,
            equity: null,
            simulationOnly: null,
            liveUnsupportedReason: /^\d+$/.test(ref) ? null : "This position has no Uniswap token id.",
          }
        : {
            action: "lp_exit",
            chainId: position.chainId,
            name: position.protocol.name,
            asset,
            contract: null,
            equity: null,
            simulationOnly: "Removing liquidity runs as a simulation for now.",
            liveUnsupportedReason: "Removing liquidity runs as a simulation for now.",
          };
    case "tokenized_equity": {
      const equity = refAddress ? getVerifiedEquityAsset(position.chainId, refAddress) : null;
      return {
        action: "equity_sell",
        chainId: position.chainId,
        name: equity?.symbol ?? position.protocol.name,
        asset: equity
          ? { symbol: equity.symbol, decimals: equity.decimals, address: equity.contractAddress.toLowerCase() as Address }
          : asset,
        contract: equity?.swapRouterAddress ?? null,
        equity,
        simulationOnly: null,
        liveUnsupportedReason: equity ? null : "This tokenized asset is not in the verified list.",
      };
    }
    default:
      return { error: `No exit path for ${position.strategyType}.` };
  }
}
