import { describe, expect, it } from "vitest";
import { DEFAULT_GUARDRAILS, type Guardrails } from "@/lib/domain/strategy";
import { evaluateProposal, type OpportunityView, type PortfolioExposure } from "./engine";
import { planDeterministicAllocation } from "./planner";

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
    riskFlags: [],
    ...overrides,
  };
}

function portfolio(overrides: Partial<PortfolioExposure> = {}): PortfolioExposure {
  // Unless a test says otherwise, the wallets hold every test asset up to the available balance.
  const available = overrides.availableUsdCents ?? 800_000n;
  return {
    totalUsdCents: 1_000_000n, // $10,000
    availableUsdCents: available,
    availableByAsset: { USDC: available, "USDC-vault": available, "USDC/USDT": available },
    byChain: {},
    byProtocol: {},
    byStrategy: {},
    byAsset: {},
    ...overrides,
  };
}

const guardrails: Guardrails = { ...DEFAULT_GUARDRAILS };

function plan(
  opportunities: OpportunityView[],
  options: { portfolio?: PortfolioExposure; guardrails?: Guardrails } = {},
) {
  return planDeterministicAllocation({
    guardrails: options.guardrails ?? guardrails,
    opportunities,
    portfolio: options.portfolio ?? portfolio(),
    now: NOW,
  });
}

const AAVE = opportunity({ id: "aave", expectedRatePercent: 4.82 });
const EARN = opportunity({
  id: "earn",
  protocolSlug: "1click-earn",
  protocolName: "1Click Earn",
  strategyType: "yield_vault",
  assetKey: "USDC-vault",
  expectedRatePercent: 5.1,
});

describe("planDeterministicAllocation", () => {
  it("ranks by rate and fills the deployable amount inside the caps", () => {
    const result = plan([AAVE, EARN]);

    expect(result.proposal.legs).toHaveLength(2);
    expect(result.proposal.deployBps).toBe(10_000);
    // Earn has the higher rate, so it is the first leg and receives more capital.
    expect(result.proposal.legs[0].opportunityId).toBe("earn");
    expect(result.proposal.legs[0].weightBps).toBeGreaterThan(result.proposal.legs[1].weightBps);
    expect(result.proposal.legs.reduce((sum, leg) => sum + leg.weightBps, 0)).toBe(10_000);
  });

  it("stops at the protocol cap instead of over-concentrating", () => {
    const result = plan([EARN]);
    // Deployable is $7,000 but a 40% protocol cap allows $4,000.
    const evaluation = evaluateProposal({
      proposal: result.proposal,
      guardrails,
      opportunities: [EARN],
      portfolio: portfolio(),
      now: NOW,
    });

    expect(evaluation.ok).toBe(true);
    // Capped at 40% of $10,000 = $4,000, sized to a 99.9% safety margin.
    expect(evaluation.totals.allocatedUsd).toBeGreaterThan(3_990);
    expect(evaluation.totals.allocatedUsd).toBeLessThanOrEqual(4_000);
    expect(result.proposal.deployBps).toBeLessThan(10_000);
    expect(result.proposal.riskNotes.join(" ")).toContain("stays liquid");
  });

  it("produces a plan the policy engine accepts", () => {
    const opportunities = [AAVE, EARN, opportunity({
      id: "uni-arb",
      protocolSlug: "uniswap-v3",
      strategyType: "stablecoin_lp",
      chainId: 42161,
      chainName: "Arbitrum One",
      assetKey: "USDC/USDT",
      expectedRatePercent: 6.15,
      riskFlags: ["depeg", "concentrated_liquidity"],
    })];

    const result = plan(opportunities);
    const evaluation = evaluateProposal({
      proposal: result.proposal,
      guardrails,
      opportunities,
      portfolio: portfolio(),
      now: NOW,
    });

    expect(evaluation.ok).toBe(true);
    expect(evaluation.legs.length).toBeGreaterThan(0);
  });

  it("discounts risk flags so a slightly lower rate can win", () => {
    const safe = opportunity({ id: "safe", expectedRatePercent: 5.0, riskFlags: [] });
    const risky = opportunity({
      id: "risky",
      protocolSlug: "risky-protocol",
      protocolName: "Risky",
      expectedRatePercent: 5.5,
      riskFlags: ["depeg", "withdrawal_liquidity", "concentrated_liquidity"],
    });

    const result = plan([risky, safe]);
    expect(result.proposal.legs[0].opportunityId).toBe("safe");
  });

  it("refuses to auto-plan arbitrage without an established net profit", () => {
    const arb = opportunity({
      id: "arb",
      strategyType: "arbitrage",
      protocolSlug: "1click",
      expectedRatePercent: null,
      expectedProfitUsd: null,
    });

    const result = plan([arb]);
    expect(result.proposal.legs).toHaveLength(0);
    expect(result.rejected.some((r) => r.opportunityId === "arb")).toBe(true);
  });

  it("skips expired, inactive, rate-less and unapproved candidates", () => {
    const skipped = [
      opportunity({ id: "expired", expiresAt: new Date("2026-11-10T11:00:00.000Z") }),
      opportunity({ id: "stale", status: "stale" }),
      opportunity({ id: "no-rate", expectedRatePercent: null }),
      opportunity({ id: "wrong-chain", chainId: 1, chainName: "Ethereum" }),
    ];

    const result = plan(skipped);
    expect(result.proposal.legs).toHaveLength(0);
    expect(result.rejected).toHaveLength(4);
    expect(result.proposal.requiresUserInput.length).toBeGreaterThan(0);
    expect(result.proposal.deployBps).toBe(0);
  });

  it("caps a leg at a small share of pool liquidity", () => {
    const thin = opportunity({ id: "thin", liquidityUsd: 20_000, protocolSlug: "thin" });
    const result = plan([thin], { guardrails: { ...guardrails, maxProtocolExposurePercent: 100, maxChainExposurePercent: 100, maxStrategyExposurePercent: 100, maxAssetExposurePercent: 100 } });

    // 10% of $20,000 = $2,000, sized to a 99.9% safety margin.
    expect(result.proposal.deployBps).toBeGreaterThan(0);
    const evaluation = evaluateProposal({
      proposal: result.proposal,
      guardrails: { ...guardrails, maxProtocolExposurePercent: 100, maxChainExposurePercent: 100, maxStrategyExposurePercent: 100, maxAssetExposurePercent: 100 },
      opportunities: [thin],
      portfolio: portfolio(),
      now: NOW,
    });
    expect(evaluation.totals.allocatedUsd).toBeGreaterThan(1_990);
    expect(evaluation.totals.allocatedUsd).toBeLessThanOrEqual(2_000);
  });

  it("is deterministic for equal scores", () => {
    const a = opportunity({ id: "aaa", protocolSlug: "p-a" });
    const b = opportunity({ id: "bbb", protocolSlug: "p-b" });
    const first = plan([a, b]).proposal.legs.map((l) => l.opportunityId);
    const second = plan([b, a]).proposal.legs.map((l) => l.opportunityId);
    expect(first).toEqual(second);
    expect(first[0]).toBe("aaa");
  });

  it("never deploys more than is available", () => {
    const result = plan([AAVE, EARN], {
      portfolio: portfolio({ availableUsdCents: 50_000n }), // only $500 available
      guardrails: { ...guardrails, maxProtocolExposurePercent: 100, maxChainExposurePercent: 100, maxStrategyExposurePercent: 100, maxAssetExposurePercent: 100 },
    });

    const evaluation = evaluateProposal({
      proposal: result.proposal,
      guardrails: { ...guardrails, maxProtocolExposurePercent: 100, maxChainExposurePercent: 100, maxStrategyExposurePercent: 100, maxAssetExposurePercent: 100 },
      opportunities: [AAVE, EARN],
      portfolio: portfolio({ availableUsdCents: 50_000n }),
      now: NOW,
    });

    expect(evaluation.totals.allocatedUsd).toBeLessThanOrEqual(500);
  });

  it("sizes legs to the deposited asset the wallets hold, not to total wallet value", () => {
    // $8,000 liquid, but only $200 of it is USDC and none is the vault's deposit asset.
    const funded = portfolio({ availableByAsset: { USDC: 20_000n } });
    const open = { ...guardrails, maxProtocolExposurePercent: 100, maxChainExposurePercent: 100, maxStrategyExposurePercent: 100, maxAssetExposurePercent: 100 };
    const result = plan([AAVE, EARN], { portfolio: funded, guardrails: open });

    expect(result.rejected).toContainEqual({
      opportunityId: EARN.id,
      reason: `not enough ${EARN.assetKey} in the wallets to fund a leg`,
    });

    const evaluation = evaluateProposal({
      proposal: result.proposal,
      guardrails: open,
      opportunities: [AAVE, EARN],
      portfolio: funded,
      now: NOW,
    });
    expect(evaluation.ok).toBe(true);
    expect(evaluation.totals.allocatedUsd).toBeGreaterThan(0);
    expect(evaluation.totals.allocatedUsd).toBeLessThanOrEqual(200);
  });

  it("plans an arbitrage opportunity when executable net profit is established", () => {
    const arbOpportunity = opportunity({
      id: "arb-1",
      strategyType: "arbitrage",
      protocolSlug: "aerodrome",
      protocolName: "Aerodrome",
      assetLabel: "WETH Base → Arb",
      expectedRatePercent: null,
      expectedProfitUsd: 12.4,
      liquidityUsd: 2_000_000,
      riskFlags: ["non_atomic"],
    });

    const result = plan([arbOpportunity], {
      guardrails: {
        ...guardrails,
        minArbitrageProfitUsd: 5,
        maxProtocolExposurePercent: 100,
        maxChainExposurePercent: 100,
        maxStrategyExposurePercent: 100,
        maxAssetExposurePercent: 100,
      },
    });

    expect(result.proposal.legs).toHaveLength(1);
    expect(result.proposal.legs[0].opportunityId).toBe("arb-1");
    expect(result.proposal.riskNotes.join(" ")).toContain("Arbitrage legs settle separately and are not atomic");
  });
});
