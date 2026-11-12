import { describe, expect, it } from "vitest";
import { requestHash, stableStringify } from "./idempotency";

describe("idempotency hashing", () => {
  it("hashes equivalent bodies identically regardless of key order", () => {
    const a = { amount: "10", wallet: "0xabc", nested: { b: 2, a: 1 } };
    const b = { wallet: "0xabc", nested: { a: 1, b: 2 }, amount: "10" };
    expect(stableStringify(a)).toBe(stableStringify(b));
    expect(requestHash(a)).toBe(requestHash(b));
  });

  it("distinguishes a changed amount", () => {
    expect(requestHash({ amount: "10" })).not.toBe(requestHash({ amount: "11" }));
  });

  it("does not collapse undefined into a different body", () => {
    expect(stableStringify({ a: 1, b: undefined })).toBe(stableStringify({ a: 1 }));
  });

  it("handles arrays and primitives deterministically", () => {
    expect(stableStringify([1, "two", { b: true, a: null }])).toBe(
      '[1,"two",{"a":null,"b":true}]',
    );
    expect(stableStringify(null)).toBe("null");
    expect(stableStringify("x")).toBe('"x"');
  });
});
