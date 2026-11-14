import { describe, expect, it } from "vitest";
import { equityMinOutputAtomic } from "./equity-sizing";

describe("equityMinOutputAtomic", () => {
  it("sizes a buy from USDC into an 18-decimal stock", () => {
    // 100 USDC at $200 = 0.5 shares; 1% slippage → 0.495
    const out = equityMinOutputAtomic({
      direction: "buy",
      amountInAtomic: 100_000_000n,
      priceUsd: 200,
      equityDecimals: 18,
      slippageBps: 100,
    });
    expect(out).toBe(495_000_000_000_000_000n);
  });

  it("sizes a sell from an 18-decimal stock into USDC", () => {
    // 0.5 shares at $200 = 100 USDC; 0.5% slippage → 99.5 USDC
    const out = equityMinOutputAtomic({
      direction: "sell",
      amountInAtomic: 500_000_000_000_000_000n,
      priceUsd: 200,
      equityDecimals: 18,
      slippageBps: 50,
    });
    expect(out).toBe(99_500_000n);
  });

  it("never returns a zero minimum", () => {
    const out = equityMinOutputAtomic({
      direction: "sell",
      amountInAtomic: 1n,
      priceUsd: 1,
      equityDecimals: 18,
      slippageBps: 100,
    });
    expect(out).toBe(1n);
  });

  it("refuses a missing or zero price", () => {
    expect(() =>
      equityMinOutputAtomic({ direction: "buy", amountInAtomic: 1n, priceUsd: 0, equityDecimals: 18, slippageBps: 0 }),
    ).toThrow();
    expect(() =>
      equityMinOutputAtomic({ direction: "buy", amountInAtomic: 1n, priceUsd: Number.NaN, equityDecimals: 18, slippageBps: 0 }),
    ).toThrow();
  });
});
