import { describe, expect, it } from "vitest";
import {
  AmountError,
  applySlippageDown,
  applySlippageUp,
  atomicToNumber,
  formatAtomic,
  parseDecimalToAtomic,
} from "./amounts";

describe("parseDecimalToAtomic", () => {
  it("converts whole and fractional amounts exactly", () => {
    expect(parseDecimalToAtomic("1", 6)).toBe(1_000_000n);
    expect(parseDecimalToAtomic("0.000001", 6)).toBe(1n);
    expect(parseDecimalToAtomic("1234.567891", 6)).toBe(1_234_567_891n);
    expect(parseDecimalToAtomic("100", 18)).toBe(100n * 10n ** 18n);
  });

  it("handles zero and empty whole parts", () => {
    expect(parseDecimalToAtomic("0", 6)).toBe(0n);
    expect(parseDecimalToAtomic(".5", 6)).toBe(500_000n);
    expect(parseDecimalToAtomic("0.0", 0)).toBe(0n);
  });

  it("supports negative values for accounting deltas", () => {
    expect(parseDecimalToAtomic("-1.5", 2)).toBe(-150n);
  });

  it("rejects precision loss instead of rounding silently", () => {
    expect(() => parseDecimalToAtomic("0.0000001", 6)).toThrow(AmountError);
  });

  it("rejects malformed input", () => {
    expect(() => parseDecimalToAtomic("1,000", 6)).toThrow(AmountError);
    expect(() => parseDecimalToAtomic("1e6", 6)).toThrow(AmountError);
    expect(() => parseDecimalToAtomic("", 6)).toThrow(AmountError);
    expect(() => parseDecimalToAtomic(".", 6)).toThrow(AmountError);
    expect(() => parseDecimalToAtomic("abc", 6)).toThrow(AmountError);
  });

  it("rejects invalid decimals", () => {
    expect(() => parseDecimalToAtomic("1", -1)).toThrow(AmountError);
    expect(() => parseDecimalToAtomic("1", 1.5)).toThrow(AmountError);
  });

  it("does not drift on float-hostile values", () => {
    // 0.1 + 0.2 in atomic units must be exactly 0.3
    const sum = parseDecimalToAtomic("0.1", 18) + parseDecimalToAtomic("0.2", 18);
    expect(formatAtomic(sum, 18)).toBe("0.3");
  });
});

describe("formatAtomic", () => {
  it("round-trips arbitrary precision amounts", () => {
    const cases: Array<[string, number]> = [
      ["1", 6],
      ["0.000001", 6],
      ["1234.567891", 6],
      ["0.000000000000000001", 18],
      ["1000000", 0],
    ];
    for (const [value, decimals] of cases) {
      expect(formatAtomic(parseDecimalToAtomic(value, decimals), decimals)).toBe(value);
    }
  });

  it("never uses exponent notation for very small numbers", () => {
    expect(formatAtomic(1n, 18)).toBe("0.000000000000000001");
    expect(formatAtomic("-1", 6)).toBe("-0.000001");
  });

  it("pads values smaller than one unit", () => {
    expect(formatAtomic(5n, 6)).toBe("0.000005");
  });
});

describe("display helpers", () => {
  it("atomicToNumber is display-only but consistent", () => {
    expect(atomicToNumber("1500000", 6)).toBeCloseTo(1.5, 12);
  });

  it("slippage bounds round in the user's favour", () => {
    const amount = 1_000_000n;
    expect(applySlippageDown(amount, 100)).toBe(990_000n);
    expect(applySlippageDown(999n, 100)).toBe(989n); // floor
    expect(applySlippageUp(amount, 100)).toBe(1_010_000n);
    expect(applySlippageUp(1n, 100)).toBe(2n); // ceil
  });

  it("rejects impossible slippage", () => {
    expect(() => applySlippageDown(1n, -1)).toThrow(AmountError);
    expect(() => applySlippageUp(1n, 10_001)).toThrow(AmountError);
  });
});
