import { formatAtomic } from "@/lib/finance/amounts";

/**
 * Valuation and Depeg Engine.
 *
 * Rules:
 *  - Token amounts remain exact atomic strings until converted to USD for display/analytics.
 *  - Stablecoins (USDC) are valued at exact $1.00 parity unless a depeg (>0.5% deviation) is observed.
 *  - Every price carries an authoritative source, observation timestamp, and data quality status.
 *  - Pure calculation functions are separated from I/O so valuation maths is 100% unit-testable.
 */

export const DEPEG_DEVIATION_THRESHOLD = 0.005; // 0.5% deviation triggers depeg warning

export type PricePoint = {
  priceUsd: number;
  source: "defillama" | "coingecko" | "parity" | "cached";
  observedAt: Date;
  confidence: number;
  isDepeg?: boolean;
};

export type RawBalanceInput = {
  chainId: number;
  contractAddress: string;
  symbol: string;
  decimals: number;
  amountAtomic: string;
  isStablecoin?: boolean;
  coingeckoId?: string;
};

export type TokenValuation = {
  chainId: number;
  contractAddress: string;
  symbol: string;
  decimals: number;
  amountAtomic: string;
  amountDisplay: number;
  priceUsd: number;
  valueUsd: number;
  priceSource: string;
  priceObservedAt: Date;
  dataQualityStatus: "complete" | "partial" | "depeg_warning" | "unpriced";
};

export type PortfolioValuationResult = {
  observedAt: Date;
  totalValueUsd: number;
  dataQualityStatus: "complete" | "partial" | "stale" | "unpriced";
  tokens: TokenValuation[];
  hasDepeg: boolean;
};

/**
 * Pure function: determine if a stablecoin is currently depegged.
 */
export function isStablecoinDepegged(marketPrice: number, targetPeg = 1.0): boolean {
  if (marketPrice <= 0) return true;
  const deviation = Math.abs(marketPrice - targetPeg) / targetPeg;
  return deviation > DEPEG_DEVIATION_THRESHOLD;
}

/**
 * Pure function: calculate token valuation from exact atomic amount and unit price.
 */
export function calculateTokenValuation(
  balance: RawBalanceInput,
  pricePoint: PricePoint | null,
): TokenValuation {
  const amountDisplay = parseFloat(formatAtomic(BigInt(balance.amountAtomic), balance.decimals));

  if (!pricePoint || pricePoint.priceUsd <= 0) {
    return {
      chainId: balance.chainId,
      contractAddress: balance.contractAddress.toLowerCase(),
      symbol: balance.symbol,
      decimals: balance.decimals,
      amountAtomic: balance.amountAtomic,
      amountDisplay,
      priceUsd: 0,
      valueUsd: 0,
      priceSource: "unpriced",
      priceObservedAt: new Date(),
      dataQualityStatus: "unpriced",
    };
  }

  let effectivePrice = pricePoint.priceUsd;
  let effectiveSource = pricePoint.source;
  let status: TokenValuation["dataQualityStatus"] = "complete";

  if (balance.isStablecoin && balance.symbol === "USDC") {
    if (isStablecoinDepegged(pricePoint.priceUsd, 1.0)) {
      status = "depeg_warning";
      effectivePrice = pricePoint.priceUsd;
    } else {
      effectivePrice = 1.0;
      effectiveSource = "parity";
    }
  }

  const valueUsd = amountDisplay * effectivePrice;

  return {
    chainId: balance.chainId,
    contractAddress: balance.contractAddress.toLowerCase(),
    symbol: balance.symbol,
    decimals: balance.decimals,
    amountAtomic: balance.amountAtomic,
    amountDisplay,
    priceUsd: effectivePrice,
    valueUsd,
    priceSource: effectiveSource,
    priceObservedAt: pricePoint.observedAt,
    dataQualityStatus: status,
  };
}

/**
 * Pure function: aggregate token valuations into a portfolio valuation.
 */
export function aggregateValuations(
  valuations: TokenValuation[],
  observedAt = new Date(),
): PortfolioValuationResult {
  let totalValueUsd = 0;
  let hasDepeg = false;
  let hasUnpriced = false;

  for (const v of valuations) {
    totalValueUsd += v.valueUsd;
    if (v.dataQualityStatus === "depeg_warning") {
      hasDepeg = true;
    }
    if (v.dataQualityStatus === "unpriced" && BigInt(v.amountAtomic) > 0n) {
      hasUnpriced = true;
    }
  }

  const dataQualityStatus: PortfolioValuationResult["dataQualityStatus"] = hasUnpriced
    ? "partial"
    : "complete";

  return {
    observedAt,
    totalValueUsd,
    dataQualityStatus,
    tokens: valuations,
    hasDepeg,
  };
}

// In-memory price cache (TTL = 30s)
type PriceCacheEntry = {
  prices: Map<string, PricePoint>;
  cachedAt: number;
};
let globalPriceCache: PriceCacheEntry | null = null;
const CACHE_TTL_MS = 30_000;

/**
 * Fetch spot prices from DeFiLlama with CoinGecko fallback.
 */
export async function fetchSpotPrices(
  coingeckoIds: string[],
): Promise<Map<string, PricePoint>> {
  const now = Date.now();
  if (globalPriceCache && now - globalPriceCache.cachedAt < CACHE_TTL_MS) {
    return globalPriceCache.prices;
  }

  const uniqueIds = Array.from(new Set(coingeckoIds)).filter(Boolean);
  const result = new Map<string, PricePoint>();

  if (uniqueIds.length === 0) {
    return result;
  }

  try {
    // 1. Try DeFiLlama coins API
    const llamaCoins = uniqueIds.map((id) => `coingecko:${id}`).join(",");
    const res = await fetch(`https://coins.llama.fi/prices/current/${llamaCoins}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(6000),
    });

    if (res.ok) {
      const data = await res.json();
      const coins = (data as { coins?: Record<string, { price: number; timestamp: number; confidence?: number }> }).coins ?? {};

      for (const id of uniqueIds) {
        const item = coins[`coingecko:${id}`];
        if (item && typeof item.price === "number") {
          result.set(id, {
            priceUsd: item.price,
            source: "defillama",
            observedAt: new Date(item.timestamp * 1000),
            confidence: item.confidence ?? 1.0,
          });
        }
      }
    }
  } catch {
    // DeFiLlama fetch failed; fallback to CoinGecko below
  }

  // 2. Fallback to CoinGecko for any missing IDs
  const missing = uniqueIds.filter((id) => !result.has(id));
  if (missing.length > 0) {
    try {
      const params = new URLSearchParams({
        ids: missing.join(","),
        vs_currencies: "usd",
      });
      const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?${params}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(6000),
      });

      if (res.ok) {
        const data = (await res.json()) as Record<string, { usd?: number }>;
        const observedAt = new Date();
        for (const id of missing) {
          const item = data[id];
          if (item && typeof item.usd === "number") {
            result.set(id, {
              priceUsd: item.usd,
              source: "coingecko",
              observedAt,
              confidence: 0.95,
            });
          }
        }
      }
    } catch {
      // CoinGecko fallback also unavailable
    }
  }

  // If we fetched any prices, update cache
  if (result.size > 0) {
    globalPriceCache = {
      prices: result,
      cachedAt: now,
    };
  }

  return result;
}

/** Clear price cache for tests */
export function clearPriceCacheForTests(): void {
  globalPriceCache = null;
}
