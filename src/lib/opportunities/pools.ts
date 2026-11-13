import type { OpportunityInput } from "./types";

/**
 * Stablecoin Liquidity Pool Ingestion (Aerodrome / Uniswap V3 via live DEX Screener pairs).
 *
 * Never upgrades static fallback data to `dataMode: "live"`. If live DEX Screener reads fail,
 * falls back honestly with `dataMode: "sample"` and missing/stale provenance flags.
 */

export type PoolConfig = {
  chainId: number;
  dexScreenerChain: "base" | "arbitrum";
  protocolSlug: string;
  protocolName: string;
  protocolType: "dex";
  tokenOrPairRef: string;
  poolAddress: string;
  feeBps: number;
  fallbackVolume24h: number;
  fallbackTvl: number;
};

export const TRACKED_POOLS: PoolConfig[] = [
  {
    chainId: 8453,
    dexScreenerChain: "base",
    protocolSlug: "aerodrome",
    protocolName: "Aerodrome Slipstream",
    protocolType: "dex",
    tokenOrPairRef: "EURC / USDC 0.01%",
    poolAddress: "0x6eaEc4F69c92BD16a4B018Ceb6FE7A446A113598",
    feeBps: 1,
    fallbackVolume24h: 3_200_000,
    fallbackTvl: 348_000,
  },
  {
    chainId: 42161,
    dexScreenerChain: "arbitrum",
    protocolSlug: "uniswap-v3",
    protocolName: "Uniswap V3",
    protocolType: "dex",
    tokenOrPairRef: "USDT0 / USDC 0.01%",
    poolAddress: "0x13398E27a21Be1218b6900cbEDF677571df42A48",
    feeBps: 1,
    fallbackVolume24h: 1_700,
    fallbackTvl: 33_800,
  },
];

export function calculatePoolFeeApy(
  volume24hUsd: number,
  tvlUsd: number,
  feeBps: number,
): number {
  if (tvlUsd <= 0 || volume24hUsd <= 0 || feeBps <= 0) return 0;
  const feeRate = feeBps / 10_000;
  const annualFees = volume24hUsd * feeRate * 365;
  const apy = (annualFees / tvlUsd) * 100;
  return Math.round(apy * 100) / 100;
}

export async function ingestPoolOpportunities(): Promise<OpportunityInput[]> {
  const now = new Date();
  const results: OpportunityInput[] = [];

  for (const pool of TRACKED_POOLS) {
    let volume24hUsd = pool.fallbackVolume24h;
    let tvlUsd = pool.fallbackTvl;
    let isLive = false;

    try {
      const res = await fetch(
        `https://api.dexscreener.com/latest/dex/pairs/${pool.dexScreenerChain}/${pool.poolAddress}`,
        { signal: AbortSignal.timeout(6_000) },
      );
      if (res.ok) {
        const json = (await res.json()) as {
          pair?: { liquidity?: { usd?: number }; volume?: { h24?: number } };
          pairs?: Array<{ liquidity?: { usd?: number }; volume?: { h24?: number } }>;
        };
        const pair = json.pair ?? json.pairs?.[0];
        if (
          typeof pair?.liquidity?.usd === "number" &&
          pair.liquidity.usd > 0 &&
          typeof pair?.volume?.h24 === "number"
        ) {
          tvlUsd = Math.round(pair.liquidity.usd);
          volume24hUsd = Math.round(pair.volume.h24);
          isLive = true;
        }
      }
    } catch {
      // Preserve fallback values with honest dataMode: "sample"
    }

    const estimatedApy = calculatePoolFeeApy(volume24hUsd, tvlUsd, pool.feeBps);

    results.push({
      strategyType: "stablecoin_lp",
      protocolSlug: pool.protocolSlug,
      protocolName: pool.protocolName,
      protocolType: pool.protocolType,
      websiteUrl:
        pool.chainId === 8453 ? "https://aerodrome.finance" : "https://app.uniswap.org",
      docsUrl: "https://developers.uniswap.org",
      riskNotes:
        "Concentrated liquidity; stablecoin depeg, range out-of-bounds, and impermanent loss risk.",
      chainId: pool.chainId,
      tokenOrPairRef: pool.tokenOrPairRef,
      marketOrPoolAddress: pool.poolAddress,
      estimatedApy,
      rateType: "APY",
      tvlUsd,
      volume24hUsd,
      liquidityUsd: tvlUsd,
      feesJson: {
        poolFeeBps: pool.feeBps,
        feeTier: `${(pool.feeBps / 100).toFixed(2)}%`,
      },
      withdrawalJson: {
        immediate: true,
        liquidityRemoval: "proportional",
      },
      riskFlags: isLive
        ? ["concentrated_range", "stablecoin_depeg", "impermanent_loss"]
        : ["concentrated_range", "stablecoin_depeg", "sample_fallback_rate"],
      sourcePayload: {
        provider: isLive ? "dexscreener_v1_pair" : "sample_fallback",
        feeBps: pool.feeBps,
        annualizedVolumeMultiplier: 365,
      },
      dataMode: isLive ? "live" : "sample",
      observedAt: now,
      status: "active",
    });
  }

  return results;
}
