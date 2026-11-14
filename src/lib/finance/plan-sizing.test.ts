import { describe, expect, it } from "vitest";
import {
  amountAfterLeg,
  estimatedYearlyUsd,
  fundLegs,
  legCostBps,
  shareOf,
  splitPairEven,
} from "./plan-sizing";

describe("amountAfterLeg", () => {
  it("passes the amount through when there is no preceding leg", () => {
    expect(amountAfterLeg({ amountAtomic: 100_000_000n, legMinOutAtomic: null })).toBe(100_000_000n);
  });

  it("sizes from the guaranteed minimum, not the typed amount", () => {
    expect(amountAfterLeg({ amountAtomic: 100_000_000n, legMinOutAtomic: 99_870_000n })).toBe(99_870_000n);
  });

  it("rejects negative amounts", () => {
    expect(() => amountAfterLeg({ amountAtomic: -1n, legMinOutAtomic: null })).toThrow();
  });
});

describe("legCostBps", () => {
  it("measures a USDC→USDC leg in basis points", () => {
    // 100 USDC in, 99.975 out = 2.5 bps
    expect(
      legCostBps({ amountInAtomic: 100_000_000n, decimalsIn: 6, amountOutAtomic: 99_975_000n, decimalsOut: 6 }),
    ).toBe(2.5);
  });

  it("normalises different decimals before comparing", () => {
    expect(
      legCostBps({
        amountInAtomic: 1_000_000n,
        decimalsIn: 6,
        amountOutAtomic: 999_000_000_000_000_000n,
        decimalsOut: 18,
      }),
    ).toBe(10);
  });

  it("never reports a negative cost", () => {
    expect(legCostBps({ amountInAtomic: 100n, decimalsIn: 6, amountOutAtomic: 101n, decimalsOut: 6 })).toBe(0);
  });
});

describe("shareOf", () => {
  it("rounds down", () => {
    expect(shareOf(10_000_001n, 2_500)).toBe(2_500_000n);
  });
  it("rejects out-of-range bps", () => {
    expect(() => shareOf(1n, 10_001)).toThrow();
  });
});

describe("splitPairEven", () => {
  it("gives the odd unit to the first leg", () => {
    expect(splitPairEven({ amountAtomic: 101n, decimals0: 6, decimals1: 6 })).toEqual([51n, 50n]);
  });
  it("refuses to split tokens with different decimals", () => {
    expect(() => splitPairEven({ amountAtomic: 100n, decimals0: 6, decimals1: 18 })).toThrow();
  });
});

describe("fundLegs", () => {
  it("funds a leg from its own chain when possible", () => {
    expect(
      fundLegs({ legs: [{ chainId: 8453, amountAtomic: 10n }], balances: { 8453: 20n, 42161: 100n } }),
    ).toEqual([{ fromChainId: 8453 }]);
  });

  it("bridges from the richest chain when the own chain is short", () => {
    expect(
      fundLegs({ legs: [{ chainId: 8453, amountAtomic: 50n }], balances: { 8453: 20n, 42161: 100n } }),
    ).toEqual([{ fromChainId: 42161 }]);
  });

  it("never spends the same units twice", () => {
    expect(
      fundLegs({
        legs: [
          { chainId: 42161, amountAtomic: 80n },
          { chainId: 42161, amountAtomic: 80n },
        ],
        balances: { 8453: 50n, 42161: 100n },
      }),
    ).toEqual([{ fromChainId: 42161 }, null]);
  });
});

describe("estimatedYearlyUsd", () => {
  it("multiplies amount by rate", () => {
    expect(estimatedYearlyUsd(1_000, 5)).toBe(50);
  });
  it("returns null without a rate", () => {
    expect(estimatedYearlyUsd(1_000, null)).toBeNull();
  });
});
