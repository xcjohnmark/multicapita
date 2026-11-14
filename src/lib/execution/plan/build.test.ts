import { describe, expect, it } from "vitest";
import { buildEntrySteps, buildExitSteps, buildSendSteps, buildSwapSteps } from "./build";
import { simulatedTimeline, simulationRef } from "./simulate";

const USDC = { symbol: "USDC", decimals: 6 };

describe("buildEntrySteps", () => {
  it("skips the bridge when the source is already on the target chain", () => {
    const steps = buildEntrySteps({
      action: "supply",
      targetChainId: 8453,
      targetName: "Aave v3",
      asset: USDC,
      sourceChainId: 8453,
      amountAtomic: 100_000_000n,
      legMinOutAtomic: null,
      needsApproval: true,
    });
    expect(steps.map((step) => step.type)).toEqual(["approve", "supply", "record"]);
    expect(steps[1].amountAtomic).toBe(100_000_000n);
  });

  it("bridges first and sizes later steps from the route minimum", () => {
    const steps = buildEntrySteps({
      action: "vault_deposit",
      targetChainId: 8453,
      targetName: "gtUSDCp",
      asset: USDC,
      sourceChainId: 42161,
      amountAtomic: 100_000_000n,
      legMinOutAtomic: 99_800_000n,
      needsApproval: true,
    });
    expect(steps.map((step) => step.type)).toEqual(["bridge", "approve", "vault_deposit", "record"]);
    expect(steps[0].amountAtomic).toBe(100_000_000n);
    expect(steps[1].amountAtomic).toBe(99_800_000n);
    expect(steps[2].amountAtomic).toBe(99_800_000n);
  });

  it("omits the approval when the allowance already covers the amount", () => {
    const steps = buildEntrySteps({
      action: "supply",
      targetChainId: 42161,
      targetName: "Aave v3",
      asset: USDC,
      sourceChainId: 42161,
      amountAtomic: 1n,
      legMinOutAtomic: null,
      needsApproval: false,
    });
    expect(steps.map((step) => step.type)).toEqual(["supply", "record"]);
  });

  it("refuses a cross-chain entry without a route minimum", () => {
    expect(() =>
      buildEntrySteps({
        action: "supply",
        targetChainId: 8453,
        targetName: "Aave v3",
        asset: USDC,
        sourceChainId: 42161,
        amountAtomic: 1n,
        legMinOutAtomic: null,
        needsApproval: true,
      }),
    ).toThrow();
  });

  it("models arbitrage as two independent legs, simulation only", () => {
    const steps = buildEntrySteps({
      action: "arbitrage",
      targetChainId: 42161,
      targetName: "Aerodrome ↔ Camelot",
      asset: USDC,
      tradedAsset: { symbol: "WETH", decimals: 18 },
      sourceChainId: 8453,
      amountAtomic: 100_000_000n,
      legMinOutAtomic: null,
      needsApproval: false,
    });
    expect(steps.map((step) => step.type)).toEqual(["swap", "dex_swap", "record"]);
    expect(steps[0].simulationOnly).toBeTruthy();
  });

  it("rejects a zero amount", () => {
    expect(() =>
      buildEntrySteps({
        action: "supply",
        targetChainId: 8453,
        targetName: "Aave v3",
        asset: USDC,
        sourceChainId: 8453,
        amountAtomic: 0n,
        legMinOutAtomic: null,
        needsApproval: false,
      }),
    ).toThrow();
  });
});

describe("buildExitSteps", () => {
  it("withdraws then bridges when delivering elsewhere", () => {
    const steps = buildExitSteps({
      action: "withdraw",
      chainId: 8453,
      positionName: "Aave v3",
      amountAtomic: 50_000_000n,
      asset: USDC,
      deliverChainId: 42161,
      needsApproval: false,
    });
    expect(steps.map((step) => step.type)).toEqual(["withdraw", "bridge", "record"]);
  });

  it("collects fees without an amount", () => {
    const steps = buildExitSteps({
      action: "lp_collect",
      chainId: 42161,
      positionName: "USDC/USDT0",
      amountAtomic: 0n,
      asset: USDC,
      deliverChainId: null,
      needsApproval: false,
    });
    expect(steps.map((step) => step.type)).toEqual(["lp_collect", "record"]);
    expect(steps[0].amountAtomic).toBeNull();
  });
});

describe("swap and send", () => {
  it("labels a same-asset cross-chain swap as a bridge", () => {
    expect(
      buildSwapSteps({ fromChainId: 8453, toChainId: 42161, from: USDC, to: USDC, amountAtomic: 1n })[0].type,
    ).toBe("bridge");
    expect(
      buildSwapSteps({
        fromChainId: 8453,
        toChainId: 8453,
        from: USDC,
        to: { symbol: "WETH", decimals: 18 },
        amountAtomic: 1n,
      })[0].type,
    ).toBe("swap");
  });

  it("sends on the same chain with a transfer", () => {
    expect(
      buildSendSteps({ chainId: 8453, toChainId: 8453, asset: USDC, amountAtomic: 1n, recipientLabel: "0x12…34" })[0]
        .type,
    ).toBe("transfer");
  });
});

describe("simulatedTimeline", () => {
  const approvedAt = new Date("2026-11-13T10:00:00Z");
  const steps = [{ type: "approve" as const }, { type: "supply" as const }, { type: "record" as const }];

  it("starts with the first step submitted and the rest pending", () => {
    const result = simulatedTimeline(steps, approvedAt, new Date(approvedAt.getTime() + 500));
    expect(result.steps.map((step) => step.status)).toEqual(["submitted", "pending", "pending"]);
    expect(result.completed).toBe(false);
  });

  it("moves through settling to done in order", () => {
    const result = simulatedTimeline(steps, approvedAt, new Date(approvedAt.getTime() + 7_000));
    expect(result.steps.map((step) => step.status)).toEqual(["done", "settling", "pending"]);
  });

  it("completes after the last step", () => {
    const result = simulatedTimeline(steps, approvedAt, new Date(approvedAt.getTime() + 60_000));
    expect(result.completed).toBe(true);
    expect(result.steps.every((step) => step.status === "done")).toBe(true);
    expect(result.completedAt?.getTime()).toBe(approvedAt.getTime() + 4_000 + 6_000 + 1_500);
  });

  it("never produces a reference shaped like a transaction hash", () => {
    expect(simulationRef("clxyz123456", 0)).toMatch(/^sim-/);
  });
});
