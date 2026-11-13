import { quoteCrossChainCost } from "@/lib/near/route-cost";
import type { OpportunityInput } from "./types";

/**
 * Cross-Chain Arbitrage Scanner (Base <-> Arbitrum).
 *
 * Computes real spread from live DEX Screener quotes on Base vs Arbitrum plus
 * live 1Click bridge quote cost. Marks `dataMode: "sample"` whenever live endpoints fail.
 */

export const MIN_ARBITRAGE_PROFIT_USD = 5.0;

export type ArbitrageCalcParams = {
  buyInputUsd: number;
  sellOutputUsd: number;
  dexFeesUsd: number;
  gasCostUsd: number;
  bridgeFeeUsd: number;
  minProfitUsd?: number;
};

export type ArbitrageCalcResult = {
  netProfitUsd: number;
  profitBps: number;
  isExecutable: boolean;
  status: "active" | "rejected";
  reason?: string;
};

export function calculateArbitrageNetProfit({
  buyInputUsd,
  sellOutputUsd,
  dexFeesUsd,
  gasCostUsd,
  bridgeFeeUsd,
  minProfitUsd = MIN_ARBITRAGE_PROFIT_USD,
}: ArbitrageCalcParams): ArbitrageCalcResult {
  const grossProfit = sellOutputUsd - buyInputUsd;
  const totalCost = dexFeesUsd + gasCostUsd + bridgeFeeUsd;
  const netProfitUsd = Math.round((grossProfit - totalCost) * 100) / 100;

  const profitBps = buyInputUsd > 0 ? Math.round((netProfitUsd / buyInputUsd) * 10_000) : 0;
  const isExecutable = netProfitUsd >= minProfitUsd;

  return {
    netProfitUsd,
    profitBps,
    isExecutable,
    status: isExecutable ? "active" : "rejected",
    reason: isExecutable
      ? undefined
      : `Net profit ($${netProfitUsd}) is below user minimum threshold ($${minProfitUsd})`,
  };
}

export type ArbOpportunityConfig = {
  assetSymbol: string;
  baseTokenAddress: string;
  arbTokenAddress: string;
  sourceChainId: number;
  destChainId: number;
  sourceDex: string;
  destDex: string;
  tradeSizeUsd: number;
  dexFeeBps: number;
  gasCostUsd: number;
};

export const TRACKED_ARB_PAIRS: ArbOpportunityConfig[] = [
  {
    assetSymbol: "WETH",
    baseTokenAddress: "0x4200000000000000000000000000000000000006",
    arbTokenAddress: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
    sourceChainId: 8453,
    destChainId: 42161,
    sourceDex: "Aerodrome / Uniswap",
    destDex: "Uniswap V3",
    tradeSizeUsd: 10_000,
    dexFeeBps: 5,
    gasCostUsd: 0.4,
  },
  {
    assetSymbol: "USDC",
    baseTokenAddress: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    arbTokenAddress: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
    sourceChainId: 8453,
    destChainId: 42161,
    sourceDex: "Aerodrome",
    destDex: "Uniswap V3",
    tradeSizeUsd: 2_000,
    dexFeeBps: 2,
    gasCostUsd: 0.4,
  },
];

async function fetchDexPriceUsd(chain: "base" | "arbitrum", address: string): Promise<{
  priceUsd: number;
  liquidityUsd: number;
} | null> {
  try {
    const res = await fetch(`https://api.dexscreener.com/tokens/v1/${chain}/${address}`, {
      signal: AbortSignal.timeout(6_000),
    });
    if (!res.ok) return null;
    const pairs = (await res.json()) as Array<{
      priceUsd?: string;
      liquidity?: { usd?: number };
    }>;
    if (!Array.isArray(pairs) || pairs.length === 0) return null;
    const top = [...pairs].sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
    const priceUsd = top?.priceUsd ? Number(top.priceUsd) : NaN;
    if (!Number.isFinite(priceUsd) || priceUsd <= 0) return null;
    return {
      priceUsd,
      liquidityUsd: Math.round(top?.liquidity?.usd ?? 0),
    };
  } catch {
    return null;
  }
}

export async function ingestArbitrageOpportunities(): Promise<OpportunityInput[]> {
  const now = new Date();
  const results: OpportunityInput[] = [];

  for (const arb of TRACKED_ARB_PAIRS) {
    const [baseQuote, arbQuote, oneClickCost] = await Promise.all([
      fetchDexPriceUsd("base", arb.baseTokenAddress),
      fetchDexPriceUsd("arbitrum", arb.arbTokenAddress),
      quoteCrossChainCost({
        fromChainId: arb.sourceChainId,
        toChainId: arb.destChainId,
        amountUsd: arb.tradeSizeUsd,
      }).catch(() => ({ ok: false as const })),
    ]);

    const hasLiveSpread = Boolean(baseQuote && arbQuote);
    let grossSpreadBps = 0;
    let directionReversed = false;
    if (baseQuote && arbQuote) {
      const spreadA = ((arbQuote.priceUsd - baseQuote.priceUsd) / baseQuote.priceUsd) * 10_000;
      const spreadB = ((baseQuote.priceUsd - arbQuote.priceUsd) / arbQuote.priceUsd) * 10_000;
      if (spreadB > spreadA) {
        grossSpreadBps = Math.max(0, Math.round(spreadB * 10) / 10);
        directionReversed = true;
      } else {
        grossSpreadBps = Math.max(0, Math.round(spreadA * 10) / 10);
      }
    }

    const bridgeBps =
      oneClickCost.ok && typeof oneClickCost.impliedCostBps === "number"
        ? oneClickCost.impliedCostBps
        : 2.5;

    const buyInputUsd = arb.tradeSizeUsd;
    const sellOutputUsd = buyInputUsd * (1 + grossSpreadBps / 10_000);
    const dexFeesUsd = buyInputUsd * (arb.dexFeeBps / 10_000);
    const bridgeFeeUsd = buyInputUsd * (bridgeBps / 10_000);

    const calc = calculateArbitrageNetProfit({
      buyInputUsd,
      sellOutputUsd,
      dexFeesUsd,
      gasCostUsd: arb.gasCostUsd,
      bridgeFeeUsd,
      minProfitUsd: MIN_ARBITRAGE_PROFIT_USD,
    });

    const routeLabel = directionReversed
      ? `${arb.assetSymbol}: Arb (${arb.destDex}) → Base (${arb.sourceDex})`
      : `${arb.assetSymbol}: Base (${arb.sourceDex}) → Arb (${arb.destDex})`;

    results.push({
      strategyType: "arbitrage",
      protocolSlug: "aerodrome",
      protocolName: `${arb.sourceDex} ↔ ${arb.destDex}`,
      protocolType: "dex",
      websiteUrl: "https://aerodrome.finance",
      docsUrl: "https://docs.agentsonintents.com",
      riskNotes:
        "Cross-chain latency; execution occurs across two independent legs with settlement delay.",
      chainId: directionReversed ? arb.destChainId : arb.sourceChainId,
      tokenOrPairRef: routeLabel,
      marketOrPoolAddress: directionReversed ? arb.arbTokenAddress : arb.baseTokenAddress,
      estimatedApy: calc.profitBps > 0 ? calc.profitBps / 100 : 0,
      rateType: "estimated_net_trade_profit",
      tvlUsd: Math.min(baseQuote?.liquidityUsd ?? 0, arbQuote?.liquidityUsd ?? 0) || undefined,
      liquidityUsd: Math.min(baseQuote?.liquidityUsd ?? 0, arbQuote?.liquidityUsd ?? 0) || undefined,
      feesJson: {
        dexFeeBps: arb.dexFeeBps,
        bridgeFeeBps: bridgeBps,
        gasCostUsd: arb.gasCostUsd,
      },
      withdrawalJson: {
        immediate: true,
        settlementTimeSeconds: 30,
      },
      riskFlags: hasLiveSpread
        ? ["cross_chain_latency", "non_atomic_execution", "slippage_drift"]
        : ["cross_chain_latency", "non_atomic_execution", "live_spread_unavailable"],
      sourcePayload: {
        provider: hasLiveSpread ? "dexscreener_plus_1click" : "sample_fallback",
        tradeSizeUsd: arb.tradeSizeUsd,
        grossSpreadBps,
        expectedProfitUsd: calc.netProfitUsd,
        basePriceUsd: baseQuote?.priceUsd ?? null,
        arbPriceUsd: arbQuote?.priceUsd ?? null,
        isExecutable: calc.isExecutable,
        reason: calc.reason ?? null,
      },
      dataMode: hasLiveSpread ? "live" : "sample",
      observedAt: now,
      status: hasLiveSpread ? calc.status : "rejected",
    });
  }

  return results;
}
