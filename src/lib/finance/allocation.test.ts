import { describe, expect, it } from "vitest";
import {
  allocateByWeightBps,
  ceilPercentOfCents,
  centsToUsd,
  normaliseWeights,
  percentOfCents,
  usdToCents,
} from "./allocation";
import { AmountError } from "./amounts";

describe("usdToCents", () => {
  it("rounds to whole cents exactly once", () => {
    expect(usdToCents(11682.15)).toBe(1_168_215n);
    expect(usdToCents(0.1)).toBe(10n);
    expect(usdToCents(0)).toBe(0n);
  });

  it("rejects non-finite values", () => {
    expect(() => usdToCents(Number.NaN)).toThrow(AmountError);
    expect(() => usdToCents(Number.POSITIVE_INFINITY)).toThrow(AmountError);
  });

  it("round-trips through centsToUsd", () => {
    expect(centsToUsd(usdToCents(2500.37))).toBe(2500.37);
  });
});

describe("percentOfCents", () => {
  it("computes floors without float drift", () => {
    expect(percentOfCents(1_000_000n, 30)).toBe(300_000n);
    expect(percentOfCents(999n, 33.33)).toBe(332n); // 999 * 3333 / 10000, floored
    expect(percentOfCents(100n, 0)).toBe(0n);
    expect(percentOfCents(100n, 100)).toBe(100n);
  });

  it("rejects impossible percentages", () => {
    expect(() => percentOfCents(100n, -1)).toThrow(AmountError);
    expect(() => percentOfCents(100n, 100.01)).toThrow(AmountError);
  });
});

describe("ceilPercentOfCents", () => {
  it("never withholds less than the configured minimum", () => {
    // $11,682.15 at 30% is 350,464.5 cents: flooring would reserve 29.9999% of the portfolio.
    expect(ceilPercentOfCents(1_168_215n, 30)).toBe(350_465n);
    expect(ceilPercentOfCents(1_000_000n, 30)).toBe(300_000n);
    expect(ceilPercentOfCents(100n, 0)).toBe(0n);
    expect(ceilPercentOfCents(100n, 100)).toBe(100n);
  });

  it("rejects impossible percentages", () => {
    expect(() => ceilPercentOfCents(100n, -1)).toThrow(AmountError);
    expect(() => ceilPercentOfCents(100n, 100.01)).toThrow(AmountError);
  });
});

describe("allocateByWeightBps", () => {
  it("distributes the full amount with no residue", () => {
    const total = 1_168_215n;
    const weights = [5000, 3000, 2000];
    const amounts = allocateByWeightBps(total, weights);

    expect(amounts.reduce((sum, a) => sum + a, 0n)).toBe(total);
    // 584 107.5 / 350 464.5 / 233 643 floor to 584 107 + 350 464 + 233 643 = 1 168 214,
    // so the one-cent remainder goes to the largest weight (the first leg).
    expect(amounts).toEqual([584_108n, 350_464n, 233_643n]);
  });

  it("gives the remainder to the largest leg, keeping the sum exact", () => {
    // 10 cents across 3 equal weights: 3+3+3 = 9, one cent must go somewhere deterministic.
    const amounts = allocateByWeightBps(10n, [3333, 3333, 3334]);
    expect(amounts.reduce((sum, a) => sum + a, 0n)).toBe(10n);
    expect(amounts[2]).toBe(4n); // largest weight gets the remainder
  });

  it("breaks ties by earliest index", () => {
    const amounts = allocateByWeightBps(10n, [100, 100]);
    expect(amounts).toEqual([5n, 5n]);
  });

  it("handles a single leg and a zero total", () => {
    expect(allocateByWeightBps(500n, [10_000])).toEqual([500n]);
    expect(allocateByWeightBps(0n, [5000, 5000])).toEqual([0n, 0n]);
  });

  it("returns zeros when all weights are zero", () => {
    expect(allocateByWeightBps(100n, [0, 0])).toEqual([0n, 0n]);
  });

  it("rejects negatives and fractional weights", () => {
    expect(() => allocateByWeightBps(-1n, [100])).toThrow(AmountError);
    expect(() => allocateByWeightBps(100n, [-100])).toThrow(AmountError);
    expect(() => allocateByWeightBps(100n, [1.5])).toThrow(AmountError);
  });
});

describe("normaliseWeights", () => {
  it("scales to exactly 10 000 bps", () => {
    expect(normaliseWeights([50, 30, 20])).toEqual([5000, 3000, 2000]);
    // Equal weights tie, so the drift goes to the earliest leg for determinism.
    expect(normaliseWeights([1, 1, 1])).toEqual([3334, 3333, 3333]);
  });

  it("returns null when there is nothing to normalise", () => {
    expect(normaliseWeights([0, 0])).toBeNull();
    expect(normaliseWeights([])).toBeNull();
  });

  it("always sums to 10 000, regardless of input drift", () => {
    for (const input of [[7, 13, 61, 19], [1], [999, 1], [0.5, 0.5]]) {
      const result = normaliseWeights(input);
      if (result) expect(result.reduce((s, w) => s + w, 0)).toBe(10_000);
    }
  });
});
