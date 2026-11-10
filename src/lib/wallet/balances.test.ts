import { describe, expect, it } from "vitest";
import { getChain } from "@/lib/chains";
import { parseAddress, toChainBalance } from "./balances";

const BASE = getChain(8453)!;
const ARB = getChain(42161)!;

describe("parseAddress", () => {
  it("accepts a valid EVM address without checksum enforcement", () => {
    expect(parseAddress("0x000000000000000000000000000000000000dead")).toBeTruthy();
    expect(parseAddress("0x833589fcd6edb6e08f4c7c32d4f71b54bda02913")).toBeTruthy();
  });

  it("rejects malformed addresses", () => {
    expect(parseAddress("0x123")).toBeNull();
    expect(parseAddress("not-an-address")).toBeNull();
    expect(parseAddress("")).toBeNull();
  });
});

describe("toChainBalance", () => {
  it("keeps the exact atomic amount and formats only for display", () => {
    const result = toChainBalance({
      chain: BASE,
      blockNumber: 31_000_000n,
      nativeAtomic: 1_234_567_890_123_456_789n,
      usdcAtomic: 4_200_000_000n, // 4,200 USDC at 6 decimals
      observedAt: new Date("2026-11-10T12:00:00.000Z"),
      error: null,
    });

    expect(result.blockNumber).toBe("31000000");
    expect(result.observedAt).toBe("2026-11-10T12:00:00.000Z");
    expect(result.source).toBe("rpc");
    expect(result.tokens[0]).toMatchObject({
      symbol: "USDC",
      decimals: 6,
      amountAtomic: "4200000000",
      amountDisplay: "4200",
    });
    // Native ETH is trimmed for display but the atomic value is untouched.
    expect(result.native?.amountAtomic).toBe("1234567890123456789");
    expect(result.native?.amountDisplay).toBe("1.234567");
  });

  it("reports a failed chain read as a failure, never as a zero balance", () => {
    const result = toChainBalance({
      chain: ARB,
      blockNumber: null,
      nativeAtomic: null,
      usdcAtomic: null,
      observedAt: new Date("2026-11-10T12:00:00.000Z"),
      error: "RPC timeout",
    });

    expect(result.error).toBe("RPC timeout");
    expect(result.tokens).toHaveLength(0);
    expect(result.native).toBeNull();
    expect(result.blockNumber).toBeNull();
  });

  it("never attaches a USD valuation", () => {
    const balance = toChainBalance({
      chain: BASE,
      blockNumber: 1n,
      nativeAtomic: 1n,
      usdcAtomic: 1n,
      observedAt: new Date(),
      error: null,
    });

    const keys: string[] = [];
    const walk = (value: unknown) => {
      if (Array.isArray(value)) return value.forEach(walk);
      if (value && typeof value === "object") {
        for (const [key, child] of Object.entries(value)) {
          keys.push(key.toLowerCase());
          walk(child);
        }
      }
    };
    walk(balance);

    expect(keys.some((key) => key.includes("usd") || key.includes("price"))).toBe(false);
  });
});
