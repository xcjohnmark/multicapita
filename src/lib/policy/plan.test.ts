import { describe, expect, it } from "vitest";
import { DEFAULT_GUARDRAILS } from "@/lib/domain/strategy";
import { evaluatePlanPolicy, type PlanPolicyInput } from "./plan";

function base(overrides: Partial<PlanPolicyInput> = {}): PlanPolicyInput {
  return {
    amountAtomic: 100_000_000n,
    balanceAtomic: 1_000_000_000n,
    decimals: 6,
    symbol: "USDC",
    hasCrossChainLeg: false,
    slippageBps: 50,
    guardrails: { ...DEFAULT_GUARDRAILS },
    targetChainId: 8453,
    protocolSlug: "aave-v3",
    strategyType: "lending",
    amountUsd: 100,
    portfolio: {
      totalUsd: 10_000,
      availableUsd: 6_000,
      byProtocolUsd: { "aave-v3": 1_000 },
      byChainUsd: { 8453: 5_000 },
      byStrategyUsd: { lending: 1_000 },
    },
    deploysCapital: true,
    ...overrides,
  };
}

function level(result: ReturnType<typeof evaluatePlanPolicy>, code: string) {
  return result.checks.find((check) => check.code === code)?.level;
}

describe("evaluatePlanPolicy", () => {
  it("passes a small, funded, in-policy deposit", () => {
    const result = evaluatePlanPolicy(base());
    expect(result.ok).toBe(true);
  });

  it("blocks when the balance is short", () => {
    const result = evaluatePlanPolicy(base({ balanceAtomic: 1n }));
    expect(result.ok).toBe(false);
    expect(level(result, "balance")).toBe("block");
  });

  it("enforces the 5-unit minimum only on cross-chain legs", () => {
    expect(evaluatePlanPolicy(base({ amountAtomic: 1_000_000n })).ok).toBe(true);
    const bridged = evaluatePlanPolicy(base({ amountAtomic: 1_000_000n, hasCrossChainLeg: true }));
    expect(level(bridged, "minimum_leg")).toBe("block");
  });

  it("caps slippage at min(guardrail, 1%)", () => {
    const result = evaluatePlanPolicy(base({ hasCrossChainLeg: true, slippageBps: 150 }));
    expect(level(result, "slippage")).toBe("block");
  });

  it("blocks a deposit that pushes a protocol over its cap", () => {
    const result = evaluatePlanPolicy(base({ amountAtomic: 4_000_000_000n, amountUsd: 4_000 }));
    expect(level(result, "protocol_exposure")).toBe("block");
  });

  it("only warns when the protocol was already over its cap", () => {
    const result = evaluatePlanPolicy(
      base({
        portfolio: {
          totalUsd: 10_000,
          availableUsd: 6_000,
          byProtocolUsd: { "aave-v3": 5_000 },
          byChainUsd: {},
          byStrategyUsd: {},
        },
      }),
    );
    expect(level(result, "protocol_exposure")).toBe("warn");
  });

  it("protects the liquid reserve", () => {
    const result = evaluatePlanPolicy(
      base({
        amountAtomic: 3_500_000_000n,
        amountUsd: 3_500,
        protocolSlug: null,
        strategyType: null,
      }),
    );
    expect(level(result, "liquid_reserve")).toBe("block");
  });

  it("blocks a closed equity market but not a commodity", () => {
    expect(level(evaluatePlanPolicy(base({ marketSession: "CLOSED" })), "market_hours")).toBe("block");
    expect(
      level(evaluatePlanPolicy(base({ marketSession: "CLOSED", isCommodity: true })), "market_hours"),
    ).toBe("pass");
  });

  it("warns on sample data and blocks inactive markets", () => {
    const result = evaluatePlanPolicy(base({ opportunity: { status: "stale", dataMode: "sample" } }));
    expect(level(result, "data_freshness")).toBe("warn");
    expect(level(result, "opportunity_active")).toBe("block");
  });

  it("blocks unapproved chains and protocols", () => {
    const guardrails = { ...DEFAULT_GUARDRAILS, approvedChainIds: [42161], approvedProtocols: ["uniswap-v3"] };
    const result = evaluatePlanPolicy(base({ guardrails }));
    expect(level(result, "chain_allowed")).toBe("block");
    expect(level(result, "protocol_allowed")).toBe("block");
  });

  it("does not apply exposure checks to plans that leave the portfolio", () => {
    const result = evaluatePlanPolicy(base({ deploysCapital: false, amountUsd: 9_000, amountAtomic: 9_000_000_000n, balanceAtomic: 9_000_000_000n }));
    expect(result.checks.some((check) => check.code === "liquid_reserve")).toBe(false);
  });
});

describe("evaluatePlanPolicy route minimum for volatile assets", () => {
  it("checks the route minimum in USD, not token units", () => {
    const weth = { decimals: 18, symbol: "WETH", isStablecoin: false, hasCrossChainLeg: true };
    const small = evaluatePlanPolicy(base({ ...weth, amountAtomic: 10n ** 15n, balanceAtomic: 10n ** 18n, amountUsd: 3 }));
    expect(small.checks.find((c) => c.code === "minimum_leg")?.level).toBe("block");
    const ok = evaluatePlanPolicy(base({ ...weth, amountAtomic: 10n ** 16n, balanceAtomic: 10n ** 18n, amountUsd: 30 }));
    expect(ok.checks.find((c) => c.code === "minimum_leg")?.level).toBe("pass");
  });
});
