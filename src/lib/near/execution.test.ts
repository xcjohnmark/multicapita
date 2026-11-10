import { describe, expect, it } from "vitest";
import type { OneClickClient } from "./oneclick";
import { buildDepositInstruction, minimumAcceptedOutput, prepareCrossChainMove } from "./execution";
import type { OneClickQuote, OneClickToken } from "./oneclick";

const USDC_BASE: OneClickToken = {
  assetId: "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near",
  decimals: 6,
  blockchain: "base",
  symbol: "USDC",
  contractAddress: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
};

const USDC_ARB: OneClickToken = {
  assetId: "nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near",
  decimals: 6,
  blockchain: "arb",
  symbol: "USDC",
  contractAddress: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
};

const WALLET = "0x1111111111111111111111111111111111111111";

function committedQuote(overrides: Partial<OneClickQuote["quote"]> = {}): OneClickQuote {
  return {
    correlationId: "corr-1",
    timestamp: new Date().toISOString(),
    quote: {
      depositAddress: "0x2222222222222222222222222222222222222222",
      amountIn: "100000000",
      amountOut: "99970000",
      minAmountOut: "99870000",
      deadline: new Date(Date.now() + 9 * 60_000).toISOString(),
      ...overrides,
    },
  };
}

function fakeClient(options: {
  quote?: OneClickQuote;
  tokens?: OneClickToken[];
  onQuote?: (input: unknown) => void;
}): OneClickClient {
  return {
    async getTokens() {
      return { tokens: options.tokens ?? [USDC_BASE, USDC_ARB], fetchedAt: Date.now() };
    },
    async createQuote(input: unknown) {
      options.onQuote?.(input);
      if (options.quote) return options.quote;
      return committedQuote();
    },
  } as unknown as OneClickClient;
}

describe("buildDepositInstruction", () => {
  it("encodes an ERC-20 transfer to the quoted deposit address for the quoted amount", () => {
    const instruction = buildDepositInstruction(committedQuote(), USDC_BASE, 8453, "https://basescan.org");

    expect(instruction.to).toBe("0x2222222222222222222222222222222222222222");
    expect(instruction.amountAtomic).toBe("100000000");
    expect(instruction.value).toBe(0n);
    expect(instruction.tokenAddress).toBe("0x833589fcd6edb6e08f4c7c32d4f71b54bda02913");
    // transfer(address,uint256) selector.
    expect(instruction.data.startsWith("0xa9059cbb")).toBe(true);
    expect(instruction.data).toContain("0000000000000000000000002222222222222222222222222222222222222222");
    expect(instruction.data).toContain("000000000000000000000000000000000000000000000000005f5e100"); // 100000000
  });

  it("uses a native deposit with no calldata when the origin asset has no contract", () => {
    const native: OneClickToken = { ...USDC_BASE, contractAddress: null, symbol: "ETH", decimals: 18 };
    const instruction = buildDepositInstruction(committedQuote(), native, 8453, "https://basescan.org");

    expect(instruction.tokenAddress).toBeNull();
    expect(instruction.data).toBe("0x");
    expect(instruction.value).toBe(100_000_000n);
  });

  it("refuses a quote with no deposit address", () => {
    const dry = committedQuote({ depositAddress: null });
    expect(() => buildDepositInstruction(dry, USDC_BASE, 8453, "")).toThrow(/no deposit address/);
  });

  it("refuses a quote with a non-numeric amount", () => {
    const broken = committedQuote({ amountIn: "ten" });
    expect(() => buildDepositInstruction(broken, USDC_BASE, 8453, "")).toThrow(/non-numeric/);
  });
});

describe("prepareCrossChainMove", () => {
  it("requests a committed quote with wallet-derived recipient and refund", async () => {
    let captured: Record<string, unknown> = {};
    const client = fakeClient({
      onQuote: (input) => {
        captured = input as Record<string, unknown>;
      },
    });

    const prepared = await prepareCrossChainMove({
      fromChainId: 8453,
      toChainId: 42161,
      amountAtomic: 100_000_000n,
      walletAddress: WALLET,
      slippageBps: 100,
      client,
    });

    expect(captured.dry).toBe(false);
    expect(captured.swapType).toBe("EXACT_INPUT");
    expect(captured.amount).toBe("100000000");
    expect(captured.recipient).toBe(WALLET);
    expect(captured.refundTo).toBe(WALLET);
    expect(captured.depositType).toBe("ORIGIN_CHAIN");
    expect(prepared.instruction.amountAtomic).toBe("100000000");
    expect(prepared.origin.assetId).toBe(USDC_BASE.assetId);
    expect(prepared.destination.assetId).toBe(USDC_ARB.assetId);
  });

  it("refuses a same-chain move", async () => {
    await expect(
      prepareCrossChainMove({
        fromChainId: 8453,
        toChainId: 8453,
        amountAtomic: 1n,
        walletAddress: WALLET,
        slippageBps: 100,
        client: fakeClient({}),
      }),
    ).rejects.toThrow(/different chains/);
  });

  it("refuses a zero amount", async () => {
    await expect(
      prepareCrossChainMove({
        fromChainId: 8453,
        toChainId: 42161,
        amountAtomic: 0n,
        walletAddress: WALLET,
        slippageBps: 100,
        client: fakeClient({}),
      }),
    ).rejects.toThrow(/greater than zero/);
  });

  it("refuses an unsupported chain", async () => {
    await expect(
      prepareCrossChainMove({
        fromChainId: 1,
        toChainId: 42161,
        amountAtomic: 1n,
        walletAddress: WALLET,
        slippageBps: 100,
        client: fakeClient({}),
      }),
    ).rejects.toThrow(/supported/);
  });
});

describe("minimumAcceptedOutput", () => {
  it("applies slippage downward and rounds down protectively", () => {
    expect(minimumAcceptedOutput({ expectedOutputAtomic: "1000000", slippageBps: 100 })).toBe(990_000n);
    expect(minimumAcceptedOutput({ expectedOutputAtomic: "1001", slippageBps: 100 })).toBe(990n);
  });
});
