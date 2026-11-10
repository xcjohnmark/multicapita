import { describe, expect, it } from "vitest";
import { evaluateCrossChainMove, assertExecutionAllowed, MIN_MOVE_ATOMIC } from "./execution";
import { applySlippageDown } from "@/lib/finance/amounts";

function input(overrides: Record<string, unknown> = {}) {
  return {
    fromChainId: 8453,
    toChainId: 42161,
    amountAtomic: 100_000_000n, // 100 USDC
    originBalanceAtomic: 500_000_000n,
    originChainTotalAtomic: 1_000_000_000n,
    destinationChainTotalAtomic: 100_000_000n,
    expectedOutputAtomic: 99_970_000n,
    slippageBps: 100,
    maxSlippageBps: 100,
    maxChainExposurePercent: 60,
    minAmountAtomic: MIN_MOVE_ATOMIC,
    ...overrides,
  };
}

describe("evaluateCrossChainMove", () => {
  it("accepts a move inside balance and chain limits", () => {
    const result = evaluateCrossChainMove(input());

    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(0);
    // 100 + 100 of 1 100 total = 18.2%.
    expect(result.destinationSharePercent).toBeCloseTo(18.18, 1);
    expect(result.minimumOutputAtomic).toBe(applySlippageDown(99_970_000n, 100));
  });

  it("rejects a move that exceeds the live balance", () => {
    const result = evaluateCrossChainMove(input({ originBalanceAtomic: 50_000_000n }));
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.code === "insufficient_balance")).toBe(true);
  });

  it("rejects a move below the minimum", () => {
    const result = evaluateCrossChainMove(input({ amountAtomic: 1_000_000n }));
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.code === "amount_below_minimum")).toBe(true);
  });

  it("rejects moving more than the destination chain cap allows", () => {
    const result = evaluateCrossChainMove(
      input({
        amountAtomic: 500_000_000n,
        destinationChainTotalAtomic: 800_000_000n,
        originChainTotalAtomic: 200_000_000n,
        maxChainExposurePercent: 60,
      }),
    );

    // (800 + 500) / (200 + 800) = 130% > 60%.
    expect(result.ok).toBe(false);
    const violation = result.violations.find((v) => v.code === "chain_exposure_exceeded");
    expect(violation).toBeDefined();
    expect(violation?.context?.limit).toBe(60);
  });

  it("rejects a move with excessive slippage", () => {
    const result = evaluateCrossChainMove(input({ slippageBps: 500, maxSlippageBps: 100 }));
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.code === "slippage_above_maximum")).toBe(true);
  });

  it("rejects a same-chain move and an unsupported chain", () => {
    expect(evaluateCrossChainMove(input({ toChainId: 8453 })).violations.some((v) => v.code === "same_chain")).toBe(true);
    expect(
      evaluateCrossChainMove(input({ fromChainId: 1 })).violations.some((v) => v.code === "unsupported_chain"),
    ).toBe(true);
  });

  it("rejects a quote whose minimum output collapses to zero", () => {
    const result = evaluateCrossChainMove(input({ expectedOutputAtomic: 1n, slippageBps: 10_000 }));
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.code === "output_below_minimum")).toBe(true);
  });
});

describe("assertExecutionAllowed", () => {
  const approved = 100_000_000n;

  it("permits an approved, evaluated move in live mode", () => {
    expect(
      assertExecutionAllowed({
        dataMode: "live",
        explicitApproval: true,
        requestedAmountAtomic: approved,
        approvedAmountAtomic: approved,
        evaluationOk: true,
      }),
    ).toBeNull();
  });

  it("refuses execution outside live mode", () => {
    for (const dataMode of ["sample", "dry_run"]) {
      expect(
        assertExecutionAllowed({
          dataMode,
          explicitApproval: true,
          requestedAmountAtomic: approved,
          approvedAmountAtomic: approved,
          evaluationOk: true,
        }),
      ).toContain("disabled");
    }
  });

  it("refuses without explicit approval, even in live mode", () => {
    expect(
      assertExecutionAllowed({
        dataMode: "live",
        explicitApproval: false,
        requestedAmountAtomic: approved,
        approvedAmountAtomic: approved,
        evaluationOk: true,
      }),
    ).toContain("approval");
  });

  it("refuses when the guardrails failed", () => {
    expect(
      assertExecutionAllowed({
        dataMode: "live",
        explicitApproval: true,
        requestedAmountAtomic: approved,
        approvedAmountAtomic: approved,
        evaluationOk: false,
      }),
    ).toContain("guardrails");
  });

  it("refuses when the executed amount differs from the approved amount", () => {
    expect(
      assertExecutionAllowed({
        dataMode: "live",
        explicitApproval: true,
        requestedAmountAtomic: approved,
        approvedAmountAtomic: approved + 1n,
        evaluationOk: true,
      }),
    ).toContain("does not match");
  });
});
