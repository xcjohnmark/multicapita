import { describe, expect, it } from "vitest";
import {
  aggregateValuations,
  calculateTokenValuation,
  isStablecoinDepegged,
  type PricePoint,
  type RawBalanceInput,
  type TokenValuation,
} from "./valuation";

describe("isStablecoinDepegged", () => {
  it("treats minor fluctuations within 0.5% as pegged", () => {
    expect(isStablecoinDepegged(1.0)).toBe(false);
    expect(isStablecoinDepegged(0.998)).toBe(false);
    expect(isStablecoinDepegged(1.004)).toBe(false);
    expect(isStablecoinDepegged(0.9951)).toBe(false);
  });

  it("detects depeg when price deviates > 0.5%", () => {
    expect(isStablecoinDepegged(0.994)).toBe(true);
    expect(isStablecoinDepegged(0.985)).toBe(true);
    expect(isStablecoinDepegged(1.006)).toBe(true);
    expect(isStablecoinDepegged(0.0)).toBe(true);
    expect(isStablecoinDepegged(-1.0)).toBe(true);
  });
});

describe("calculateTokenValuation", () => {
  const usdcInput: RawBalanceInput = {
    chainId: 8453,
    contractAddress: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    symbol: "USDC",
    decimals: 6,
    amountAtomic: "50000000", // 50 USDC
    isStablecoin: true,
    coingeckoId: "usd-coin",
  };

  it("values USDC at exact $1.00 parity when market price is healthy", () => {
    const price: PricePoint = {
      priceUsd: 0.9992,
      source: "defillama",
      observedAt: new Date("2026-11-12T12:00:00Z"),
      confidence: 0.99,
    };

    const val = calculateTokenValuation(usdcInput, price);
    expect(val.priceUsd).toBe(1.0);
    expect(val.priceSource).toBe("parity");
    expect(val.valueUsd).toBe(50.0);
    expect(val.dataQualityStatus).toBe("complete");
    expect(val.amountDisplay).toBe(50);
  });

  it("preserves observed market price and flags depeg warning if USDC deviates > 0.5%", () => {
    const depeggedPrice: PricePoint = {
      priceUsd: 0.985,
      source: "defillama",
      observedAt: new Date("2026-11-12T12:00:00Z"),
      confidence: 0.99,
      isDepeg: true,
    };

    const val = calculateTokenValuation(usdcInput, depeggedPrice);
    expect(val.priceUsd).toBe(0.985);
    expect(val.priceSource).toBe("defillama");
    expect(val.valueUsd).toBe(50 * 0.985);
    expect(val.dataQualityStatus).toBe("depeg_warning");
  });

  it("correctly values volatile assets (ETH, WETH) with exact decimal conversion", () => {
    const ethInput: RawBalanceInput = {
      chainId: 8453,
      contractAddress: "0x0000000000000000000000000000000000000000",
      symbol: "ETH",
      decimals: 18,
      amountAtomic: "2500000000000000000", // 2.5 ETH
      coingeckoId: "ethereum",
    };

    const ethPrice: PricePoint = {
      priceUsd: 2000.0,
      source: "defillama",
      observedAt: new Date("2026-11-12T12:00:00Z"),
      confidence: 0.99,
    };

    const val = calculateTokenValuation(ethInput, ethPrice);
    expect(val.amountDisplay).toBe(2.5);
    expect(val.priceUsd).toBe(2000.0);
    expect(val.valueUsd).toBe(5000.0);
    expect(val.dataQualityStatus).toBe("complete");
  });

  it("handles missing price safely without fabricating numbers", () => {
    const val = calculateTokenValuation(usdcInput, null);
    expect(val.priceUsd).toBe(0);
    expect(val.valueUsd).toBe(0);
    expect(val.priceSource).toBe("unpriced");
    expect(val.dataQualityStatus).toBe("unpriced");
  });
});

describe("aggregateValuations", () => {
  it("aggregates multi-token balances and sets quality status", () => {
    const valuations: TokenValuation[] = [
      {
        chainId: 8453,
        contractAddress: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
        symbol: "USDC",
        decimals: 6,
        amountAtomic: "100000000",
        amountDisplay: 100,
        priceUsd: 1.0,
        valueUsd: 100.0,
        priceSource: "parity",
        priceObservedAt: new Date(),
        dataQualityStatus: "complete",
      },
      {
        chainId: 42161,
        contractAddress: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
        symbol: "USDC",
        decimals: 6,
        amountAtomic: "50000000",
        amountDisplay: 50,
        priceUsd: 1.0,
        valueUsd: 50.0,
        priceSource: "parity",
        priceObservedAt: new Date(),
        dataQualityStatus: "complete",
      },
    ];

    const agg = aggregateValuations(valuations);
    expect(agg.totalValueUsd).toBe(150.0);
    expect(agg.dataQualityStatus).toBe("complete");
    expect(agg.hasDepeg).toBe(false);
  });

  it("flags partial status if a held token has missing price", () => {
    const valuations: TokenValuation[] = [
      {
        chainId: 8453,
        contractAddress: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
        symbol: "USDC",
        decimals: 6,
        amountAtomic: "100000000",
        amountDisplay: 100,
        priceUsd: 1.0,
        valueUsd: 100.0,
        priceSource: "parity",
        priceObservedAt: new Date(),
        dataQualityStatus: "complete",
      },
      {
        chainId: 8453,
        contractAddress: "0x4200000000000000000000000000000000000006",
        symbol: "WETH",
        decimals: 18,
        amountAtomic: "1000000000000000000",
        amountDisplay: 1,
        priceUsd: 0,
        valueUsd: 0,
        priceSource: "unpriced",
        priceObservedAt: new Date(),
        dataQualityStatus: "unpriced",
      },
    ];

    const agg = aggregateValuations(valuations);
    expect(agg.totalValueUsd).toBe(100.0);
    expect(agg.dataQualityStatus).toBe("partial");
  });
});
