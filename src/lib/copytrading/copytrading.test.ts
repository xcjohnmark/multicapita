import { describe, expect, it } from "vitest";
import type { OneClickToken } from "@/lib/near/oneclick";
import { buildNearCopySetupDescriptor, NearIntentsAgentClient } from "./agent-api";
import { classifyCopyAsset, filterCopyableOneClickTokens, isMemecoinToken } from "./catalog";
import {
  computePriceDriftBps,
  computeScaledCopyUsd,
  evaluateCopyTrade,
  scoreTraderDeterministically,
} from "./policy";

const SAMPLE_TOKENS: OneClickToken[] = [
  {
    assetId: "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near",
    decimals: 6,
    blockchain: "base",
    symbol: "USDC",
    price: 1,
    contractAddress: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  },
  {
    assetId: "nep141:base-0x0bb69b79bc829e1cfcc34a740110886d98d2bd14.omft.near",
    decimals: 18,
    blockchain: "base",
    symbol: "gtUSDCp",
    price: 1.117,
    contractAddress: "0x0bb69b79bc829e1cfcc34a740110886d98d2bd14",
  },
  {
    assetId: "nep141:eth-0x68749665ff8d2d112fa859aa293f07a622782f38.omft.near",
    decimals: 6,
    blockchain: "eth",
    symbol: "XAUT",
    price: 3936.91,
    contractAddress: "0x68749665ff8d2d112fa859aa293f07a622782f38",
  },
  {
    assetId: "nep141:eth-0x6982508145454ce325ddbe47a25d4ec3d2311933.omft.near",
    decimals: 18,
    blockchain: "eth",
    symbol: "PEPE",
    price: 0.00000443,
    contractAddress: "0x6982508145454ce325ddbe47a25d4ec3d2311933",
  },
  {
    assetId: "nep141:base-0x532f27101965dd16442e59d40670faf5ebb142e4.omft.near",
    decimals: 18,
    blockchain: "base",
    symbol: "BRETT",
    price: 0.0035,
    contractAddress: "0x532f27101965dd16442e59d40670faf5ebb142e4",
  },
  {
    assetId: "nep141:eth-0xe0f63a424a4439cbe457d80e4f4b51ad25b2c56c.omft.near",
    decimals: 8,
    blockchain: "eth",
    symbol: "SPX",
    price: 0.345,
    contractAddress: "0xe0f63a424a4439cbe457d80e4f4b51ad25b2c56c",
  },
  {
    assetId: "nep245:v2_1.omni.hot.tg:56_1111",
    decimals: 18,
    blockchain: "bsc",
    symbol: "BNB(DEPRECATED)",
    price: 660,
  },
];

describe("Copytrading non-memecoin catalog", () => {
  it("detects memecoins and meme-cooking assets accurately", () => {
    expect(isMemecoinToken({ symbol: "PEPE" })).toBe(true);
    expect(isMemecoinToken({ symbol: "BRETT" })).toBe(true);
    expect(isMemecoinToken({ symbol: "$WIF" })).toBe(true);
    expect(isMemecoinToken({ symbol: "SPX" })).toBe(true); // SPX6900 memecoin collision
    expect(isMemecoinToken({ symbol: "ANY", assetId: "nep141:x.meme-cooking.near" })).toBe(true);
    expect(isMemecoinToken({ symbol: "ETH" })).toBe(false);
    expect(isMemecoinToken({ symbol: "gtUSDCp" })).toBe(false);
    expect(isMemecoinToken({ symbol: "XAUT" })).toBe(false);
  });

  it("filters memecoins and deprecated assets out of 1Click tokens", () => {
    const filtered = filterCopyableOneClickTokens(SAMPLE_TOKENS);
    expect(filtered.map((t) => t.symbol)).toEqual(["USDC", "gtUSDCp", "XAUT"]);
    expect(classifyCopyAsset({ symbol: "gtUSDCp" })).toBe("vault_receipt");
    expect(classifyCopyAsset({ symbol: "XAUT" })).toBe("rwa_commodity");
  });
});

describe("Copytrading deterministic policy engine", () => {
  const baseInput = {
    subscriptionStatus: "active" as const,
    noMemecoinsOnly: true,
    allowedActions: { spot1Click: true, vaults: true, lending: true, lp: false },
    actionKind: "spot_1click" as const,
    targetSymbol: "WETH",
    targetAssetId: "nep141:base-0x4200000000000000000000000000000000000006.omft.near",
    leaderTradeUsd: 400,
    copyScaleBps: 1000, // 10% -> $40
    maxUsdPerTrade: 50,
    maxDailyBudgetUsd: 200,
    dailyUsedUsd: 20,
    leaderPriceUsd: 2000,
    currentQuotePriceUsd: 2010, // 50 bps drift
    maxPriceDriftBps: 150,
  };

  it("allows verified blue-chip swap within drift and daily caps", () => {
    const res = evaluateCopyTrade(baseInput);
    expect(res.allowed).toBe(true);
    expect(res.targetCopyUsd).toBe(40);
    expect(res.priceDriftBps).toBe(50);
    expect(res.violations).toEqual([]);
  });

  it("blocks memecoins unconditionally when noMemecoinsOnly is enabled", () => {
    const res = evaluateCopyTrade({
      ...baseInput,
      targetSymbol: "PEPE",
      targetAssetId: "nep141:eth-0x6982508145454ce325ddbe47a25d4ec3d2311933.omft.near",
    });
    expect(res.allowed).toBe(false);
    expect(res.violations.some((v) => v.code === "memecoin_excluded_in_copytrading")).toBe(true);
  });

  it("blocks trades when price drifted beyond maxPriceDriftBps since leader block", () => {
    const res = evaluateCopyTrade({
      ...baseInput,
      leaderPriceUsd: 2000,
      currentQuotePriceUsd: 2060, // 300 bps
      maxPriceDriftBps: 150,
    });
    expect(res.allowed).toBe(false);
    expect(res.priceDriftBps).toBe(300);
    expect(res.violations.some((v) => v.code === "copy_price_drift_exceeded")).toBe(true);
  });

  it("blocks leveraged debt borrowing and disabled LP strategies", () => {
    const res = evaluateCopyTrade({
      ...baseInput,
      actionKind: "uniswap_lp",
      hasBorrowOrLeverageDebt: true,
    });
    expect(res.allowed).toBe(false);
    expect(res.violations.some((v) => v.code === "action_type_disabled")).toBe(true);
    expect(res.violations.some((v) => v.code === "borrow_leverage_blocked")).toBe(true);
  });

  it("blocks when daily copy budget is exhausted or subscription frozen", () => {
    const res = evaluateCopyTrade({
      ...baseInput,
      subscriptionStatus: "frozen",
      dailyUsedUsd: 185, // only $15 left, scaled is $40
    });
    expect(res.allowed).toBe(false);
    expect(res.violations.some((v) => v.code === "subscription_inactive")).toBe(true);
    expect(res.violations.some((v) => v.code === "copy_daily_budget_exceeded")).toBe(true);
  });

  it("computes scaled amounts and drift deterministically", () => {
    expect(computeScaledCopyUsd({ leaderTradeUsd: 1000, copyScaleBps: 1500, maxUsdPerTrade: 75 })).toBe(75);
    expect(computePriceDriftBps(100, 101.25)).toBe(125);
  });
});

describe("Trader deterministic scoring & NEAR Agent setup", () => {
  it("flags memecoin wallets and external hedge blind spots", () => {
    const score = scoreTraderDeterministically({
      hasAaveDebt: true,
      positions: [
        {
          chainId: 8453,
          chainName: "Base",
          symbol: "BRETT",
          name: "Brett",
          contractAddress: "0x532f27101965dd16442e59d40670faf5ebb142e4",
          assetClass: "memecoin",
          actionKind: "spot_1click",
          protocolName: "Spot Wallet",
          balanceDisplay: "5000",
          valueUsd: 20,
          weightPercent: 100,
          copyableVia: "blocked_memecoin",
        },
      ],
    });
    expect(score.isMemecoinFree).toBe(false);
    expect(score.styleLabel).toBe("Excluded (Memecoins)");
    expect(score.warnings.length).toBeGreaterThanOrEqual(3);
  });

  it("builds bounded NEAR Agent API & Chain Signatures setup descriptor", () => {
    const desc = buildNearCopySetupDescriptor({
      fundingNearAccountId: "alice.near",
      executionMode: "agent_auto_copy",
      maxUsdPerTrade: 50,
      maxDailyBudgetUsd: 200,
      maxPriceDriftBps: 150,
      copyLending: true,
      copyLp: false,
    });
    expect(desc.grantScope.noMemecoinsOnly).toBe(true);
    expect(desc.grantScope.allowedActions).toContain("chain_sig_protocol_call");
    expect(desc.chainSignatureDerivations.map((d) => d.chainId)).toEqual([8453, 42161, 1]);
  });

  it("refuses autonomous Agent API execution gracefully when API key is not configured", async () => {
    const client = new NearIntentsAgentClient({ apiKey: "" });
    const res = await client.submitAgentCopyOrder({
      fundingNearAccountId: "alice.near",
      destinationAsset: "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near",
      amountAtomic: "25000000",
      recipientAddress: "0x000000000000000000000000000000000000dead",
      slippageBps: 100,
      maxUsdPerTrade: 50,
    });
    expect(res.ok).toBe(false);
    expect(res.error).toContain("NEAR_INTENTS_AGENT_API_KEY is not configured");
  });
});
