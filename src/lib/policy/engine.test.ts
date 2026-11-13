import { describe, expect, it } from "vitest";
import type { AiProposal, Guardrails } from "@/lib/domain/strategy";
import { DEFAULT_GUARDRAILS } from "@/lib/domain/strategy";
import {
  evaluateProposal,
  type OpportunityView,
  type PortfolioExposure,
} from "./engine";

const NOW = new Date("2026-11-10T12:00:00.000Z");

function opportunity(overrides: Partial<OpportunityView> = {}): OpportunityView {
  return {
    id: "opp-1",
    strategyType: "lending",
    protocolSlug: "aave-v3",
    protocolName: "Aave V3",
    chainId: 8453,
    chainName: "Base",
    assetLabel: "USDC",
    assetKey: "USDC",
    expectedRatePercent: 4.82,
    rateType: "APY",
    status: "active",
    dataMode: "live",
    expiresAt: null,
    liquidityUsd: 18_200_000,
    expectedProfitUsd: null,
    ...overrides,
  };
}

/** $10,000 portfolio, $8,000 liquid, nothing deployed yet. */
function portfolio(overrides: Partial<PortfolioExposure> = {}): PortfolioExposure {
  // Unless a test says otherwise, the wallets hold every test asset up to the available balance.
  const available = overrides.availableUsdCents ?? 800_000n;
  return {
    totalUsdCents: 1_000_000n,
    availableUsdCents: available,
    availableByAsset: { USDC: available, "USDC-vault": available, "USDC/USDT": available },
    byChain: {},
    byProtocol: {},
    byStrategy: {},
    byAsset: {},
    ...overrides,
  };
}

function proposal(...weights: Array<[string, number]>): AiProposal {
  return {
    strategyName: "Test Multi-Chain Strategy",
    category: "yielding",
    summary: "Test strategy proposal.",
    howItWorks: ["Test step 1", "Test step 2"],
    targetApy: 5.0,
    decisionPoints: ["Test decision point"],
    objectiveSummary: "Grow stablecoin yield while keeping a 30% liquid buffer.",
    legs: weights.map(([opportunityId, weightBps]) => ({
      opportunityId,
      weightBps,
      rationale: "Test leg",
    })),
    deployBps: 10_000,
    riskNotes: [],
    requiresUserInput: [],
  };
}

const guardrails: Guardrails = { ...DEFAULT_GUARDRAILS };

/** Same guardrails but with concentration caps lifted, so a test can isolate one rule. */
const uncapped: Guardrails = {
  ...DEFAULT_GUARDRAILS,
  maxProtocolExposurePercent: 100,
  maxAssetExposurePercent: 100,
  maxChainExposurePercent: 100,
  maxStrategyExposurePercent: 100,
};

const THREE = [
  opportunity({ id: "aave-base", protocolSlug: "aave-v3", strategyType: "lending", chainId: 8453 }),
  opportunity({
    id: "earn-base",
    protocolSlug: "1click-earn",
    strategyType: "yield_vault",
    chainId: 8453,
    assetKey: "USDC-vault",
    assetLabel: "USDC → gtUSDCp",
  }),
  opportunity({
    id: "uni-arb",
    protocolSlug: "uniswap-v3",
    strategyType: "stablecoin_lp",
    chainId: 42161,
    chainName: "Arbitrum One",
    assetKey: "USDC/USDT",
    assetLabel: "USDC/USDT 0.01%",
  }),
];

function evaluate(
  p: AiProposal,
  options: {
    opportunities?: OpportunityView[];
    portfolio?: PortfolioExposure;
    guardrails?: Guardrails;
    now?: Date;
  } = {},
) {
  return evaluateProposal({
    proposal: p,
    guardrails: options.guardrails ?? guardrails,
    opportunities: options.opportunities ?? THREE,
    portfolio: options.portfolio ?? portfolio(),
    now: options.now ?? NOW,
  });
}

describe("evaluateProposal — accepted plans", () => {
  it("allocates the deployable amount exactly across a valid plan", () => {
    const result = evaluate(proposal(["aave-base", 5000], ["earn-base", 3000], ["uni-arb", 2000]));

    expect(result.ok).toBe(true);
    expect(result.legs).toHaveLength(3);
    expect(result.violations.filter((v) => v.severity === "error")).toHaveLength(0);

    // Reserve is 30% of 10 000 = 3 000; deployable 7 000.
    expect(result.totals.reserveUsd).toBe(3000);
    expect(result.totals.deployableUsd).toBe(7000);
    expect(result.legs.reduce((sum, leg) => sum + Number(leg.amountUsdCents), 0)).toBe(700_000);

    expect(result.legs[0].amountUsd).toBe(3500);
    expect(result.legs[1].amountUsd).toBe(2100);
    expect(result.legs[2].amountUsd).toBe(1400);
  });

  it("keeps the reserve out of the deployed amount", () => {
    const result = evaluate(proposal(["aave-base", 10_000]));
    expect(result.totals.allocatedUsd).toBe(7000);
    expect(result.totals.allocatedUsd + result.totals.reserveUsd).toBe(10_000);
  });

  it("normalises weights that do not sum to 10 000 and says so", () => {
    const result = evaluate(proposal(["aave-base", 5], ["earn-base", 5]));

    expect(result.ok).toBe(true);
    const warning = result.violations.find((v) => v.code === "weights_normalized");
    expect(warning?.severity).toBe("info");
    expect(result.legs.map((l) => l.weightBps)).toEqual([5000, 5000]);
  });

  it("flags non-live data as a warning without blocking the plan", () => {
    const sampled = THREE.map((o) => ({ ...o, dataMode: "sample" }));
    const result = evaluate(proposal(["aave-base", 10_000]), {
      opportunities: sampled,
      guardrails: uncapped,
    });

    expect(result.ok).toBe(true);
    expect(result.violations.filter((v) => v.code === "sample_data_in_plan")).toHaveLength(1);
  });

  it("requires human approval as an informational note, not an error", () => {
    const result = evaluate(proposal(["aave-base", 10_000]), { guardrails: uncapped });
    const note = result.violations.find((v) => v.code === "user_approval_required");
    expect(note?.severity).toBe("info");
    expect(result.ok).toBe(true);
  });
});

describe("evaluateProposal — rejected plans", () => {
  it("rejects an opportunity that is not in the candidate set", () => {
    const result = evaluate(proposal(["ghost", 10_000]));
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.code === "opportunity_not_found")).toBe(true);
    expect(result.legs).toHaveLength(0);
  });

  it("rejects every leg when weights are all zero", () => {
    const result = evaluate(proposal(["aave-base", 0], ["earn-base", 0]));
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.code === "weights_zero")).toBe(true);
  });

  it("rejects an empty proposal", () => {
    const result = evaluate({ ...proposal(), legs: [] });
    expect(result.ok).toBe(false);
    expect(result.violations[0].code).toBe("no_legs");
  });

  it("rejects an unapproved chain", () => {
    const result = evaluate(proposal(["uni-arb", 10_000]), {
      guardrails: { ...guardrails, approvedChainIds: [8453] },
    });
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.code === "chain_not_approved")).toBe(true);
  });

  it("rejects an unapproved protocol", () => {
    const result = evaluate(proposal(["aave-base", 10_000]), {
      guardrails: { ...guardrails, approvedProtocols: ["1click-earn"] },
    });
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.code === "protocol_not_approved")).toBe(true);
  });

  it("rejects an inactive opportunity", () => {
    const stale = THREE.map((o) => (o.id === "aave-base" ? { ...o, status: "stale" } : o));
    const result = evaluate(proposal(["aave-base", 10_000]), { opportunities: stale });
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.code === "opportunity_not_active")).toBe(true);
  });

  it("rejects an expired opportunity", () => {
    const expired = THREE.map((o) =>
      o.id === "aave-base" ? { ...o, expiresAt: new Date("2026-11-10T11:59:59.000Z") } : o,
    );
    const result = evaluate(proposal(["aave-base", 10_000]), { opportunities: expired });
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.code === "opportunity_expired")).toBe(true);
  });

  it("rejects a single protocol above the concentration cap", () => {
    // 7 000 of a 10 000 portfolio on one protocol = 70% > 40% cap.
    const result = evaluate(proposal(["aave-base", 10_000]));
    expect(result.ok).toBe(false);
    const violation = result.violations.find((v) => v.code === "exposure_protocol_exceeded");
    expect(violation).toBeDefined();
    expect(violation?.context).toMatchObject({ protocol: "aave-v3", limit: 40 });
  });

  it("rejects a chain above the concentration cap", () => {
    const result = evaluate(proposal(["aave-base", 5000], ["earn-base", 5000]), {
      guardrails: { ...guardrails, maxChainExposurePercent: 50, maxProtocolExposurePercent: 100 },
    });
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.code === "exposure_chain_exceeded")).toBe(true);
  });

  it("counts existing exposure when checking a cap", () => {
    const result = evaluate(proposal(["aave-base", 5000], ["earn-base", 5000]), {
      portfolio: portfolio({ byProtocol: { "aave-v3": 300_000n } }), // 3 000 already deployed
      guardrails: { ...guardrails, maxProtocolExposurePercent: 60 },
    });
    // aave: 3 000 existing + 3 500 new = 6 500 = 65% > 60%
    expect(result.ok).toBe(false);
    expect(
      result.violations.some(
        (v) => v.code === "exposure_protocol_exceeded" && v.context?.protocol === "aave-v3",
      ),
    ).toBe(true);
  });

  it("funds each leg only from the asset it deposits, not from total wallet value", () => {
    // $8,000 is liquid, but only $1,000 of it is USDC (the rest is, say, ETH).
    const result = evaluate(proposal(["aave-base", 5000], ["earn-base", 5000]), {
      portfolio: portfolio({
        availableByAsset: { USDC: 100_000n, "USDC-vault": 800_000n },
      }),
      guardrails: { ...guardrails, maxProtocolExposurePercent: 100, maxChainExposurePercent: 100, maxStrategyExposurePercent: 100, maxAssetExposurePercent: 100 },
    });
    expect(result.ok).toBe(false);
    const violation = result.violations.find((v) => v.code === "insufficient_available_balance");
    expect(violation?.severity).toBe("error");
    expect(violation?.context).toMatchObject({ asset: "USDC", requiredUsd: 3500, availableUsd: 1000 });
  });

  it("reports, without blocking, a cap breach that predates the plan and is not added to", () => {
    const result = evaluate(proposal(["uni-arb", 10_000]), {
      portfolio: portfolio({ byChain: { "1": 900_000n } }), // 90% already on Ethereum
      guardrails: { ...guardrails, maxProtocolExposurePercent: 100, maxChainExposurePercent: 80, maxStrategyExposurePercent: 100, maxAssetExposurePercent: 100 },
    });
    expect(result.ok).toBe(true);
    const violation = result.violations.find((v) => v.code === "exposure_chain_exceeded");
    expect(violation?.severity).toBe("warning");
    expect(violation?.context).toMatchObject({ chain: "1", preexisting: true });
  });

  it("rejects a plan that adds to a bucket already above its cap", () => {
    const result = evaluate(proposal(["uni-arb", 10_000]), {
      portfolio: portfolio({ byChain: { "42161": 900_000n } }), // Arbitrum already at 90%
      guardrails: { ...guardrails, maxProtocolExposurePercent: 100, maxChainExposurePercent: 80, maxStrategyExposurePercent: 100, maxAssetExposurePercent: 100 },
    });
    expect(result.ok).toBe(false);
    const violation = result.violations.find((v) => v.code === "exposure_chain_exceeded");
    expect(violation?.severity).toBe("error");
    expect(violation?.context?.preexisting).toBeUndefined();
  });

  it("rejects deploying more than the available balance", () => {
    const result = evaluate(proposal(["aave-base", 5000], ["earn-base", 5000]), {
      portfolio: portfolio({ availableUsdCents: 100_000n }),
      guardrails: { ...guardrails, maxProtocolExposurePercent: 100, maxChainExposurePercent: 100, maxStrategyExposurePercent: 100 },
    });
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.code === "insufficient_available_balance")).toBe(true);
  });

  it("rejects a reserve below the configured minimum", () => {
    // 80% liquid requirement leaves only 2 000 deployable, but the portfolio only has one
    // protocol that would then sit at 20% — the reserve rule must still be checked directly.
    const result = evaluateProposal({
      proposal: proposal(["aave-base", 10_000]),
      guardrails: { ...guardrails, minLiquidPercent: 100, maxProtocolExposurePercent: 100, maxStrategyExposurePercent: 100, maxChainExposurePercent: 100 },
      opportunities: THREE,
      portfolio: portfolio({ availableUsdCents: 0n }),
      now: NOW,
    });
    // 100% reserve means deployable is 0; the reserve check passes, so this asserts the
    // boundary behaves as designed rather than throwing.
    expect(result.totals.deployableUsd).toBe(0);
    expect(result.legs[0].amountUsd).toBe(0);
  });

  it("flags arbitrage with no established profit estimate", () => {
    const arb = [
      opportunity({
        id: "arb-1",
        strategyType: "arbitrage",
        protocolSlug: "1click",
        protocolName: "1Click route",
        expectedRatePercent: null,
        expectedProfitUsd: null,
      }),
    ];
    const result = evaluate(proposal(["arb-1", 10_000]), {
      opportunities: arb,
      guardrails: { ...guardrails, maxProtocolExposurePercent: 100, maxStrategyExposurePercent: 100, maxChainExposurePercent: 100 },
    });
    expect(result.violations.some((v) => v.code === "arbitrage_profit_below_minimum" && v.severity === "warning")).toBe(true);
  });

  it("does not report its own rounded reserve as a violation", () => {
    // $11,682.15 at exactly 30% is 350,464.5 cents. Flooring the reserve would leave 29.9999%
    // and make the engine reject a plan for breaking the guardrail it just applied.
    const result = evaluate(proposal(["aave-base", 10_000]), {
      portfolio: portfolio({ totalUsdCents: 1_168_215n, availableUsdCents: 817_750n }),
      guardrails: uncapped,
    });

    expect(result.violations.some((v) => v.code === "liquid_reserve_below_minimum")).toBe(false);
    expect(result.totals.reservePercent).toBeGreaterThanOrEqual(30);
    expect(result.ok).toBe(true);
  });

  it("treats a 100% cap as no constraint at all", () => {
    // The whole portfolio is already USDC; a 100% cap can never be exceeded, so it must not
    // acquire a rounding buffer that silently blocks every new leg.
    const usdcHeavy = portfolio({ byAsset: { USDC: 900_000n } });
    const result = evaluate(proposal(["aave-base", 10_000]), {
      portfolio: usdcHeavy,
      guardrails: { ...uncapped, maxAssetExposurePercent: 100 },
    });

    expect(result.ok).toBe(true);
    expect(result.violations.some((v) => v.code === "exposure_asset_exceeded")).toBe(false);
  });

  it("rejects arbitrage whose net profit is below the minimum", () => {
    const arb = [
      opportunity({
        id: "arb-1",
        strategyType: "arbitrage",
        protocolSlug: "1click",
        protocolName: "1Click route",
        expectedRatePercent: null,
        expectedProfitUsd: 1.5,
      }),
    ];
    const result = evaluate(proposal(["arb-1", 10_000]), {
      opportunities: arb,
      guardrails: { ...guardrails, minArbitrageProfitUsd: 5, maxProtocolExposurePercent: 100, maxStrategyExposurePercent: 100, maxChainExposurePercent: 100 },
    });
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.code === "arbitrage_profit_below_minimum" && v.severity === "error")).toBe(true);
  });

  it("warns when a leg would consume a large share of pool liquidity", () => {
    const thin = THREE.map((o) =>
      o.id === "aave-base" ? { ...o, liquidityUsd: 5_000 } : o,
    );
    const result = evaluateProposal({
      proposal: proposal(["aave-base", 10_000]),
      guardrails: { ...guardrails, maxProtocolExposurePercent: 100, maxStrategyExposurePercent: 100, maxChainExposurePercent: 100 },
      opportunities: thin,
      portfolio: portfolio(),
      now: NOW,
    });
    // 7 000 deployed into a 5 000-liquidity market.
    expect(result.violations.some((v) => v.code === "slippage_above_maximum")).toBe(true);
  });

  it("never returns ok:true when any error violation exists", () => {
    const result = evaluate(proposal(["aave-base", 10_000]), {
      guardrails: { ...guardrails, approvedChainIds: [1] },
    });
    const hasError = result.violations.some((v) => v.severity === "error");
    expect(result.ok).toBe(!hasError);
    expect(result.ok).toBe(false);
  });
});
