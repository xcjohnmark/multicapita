import {
  type AiProposal,
  type Guardrails,
  type PlannedLeg,
  type PolicyEvaluation,
  type StrategyType,
  type Violation,
} from "@/lib/domain/strategy";
import {
  allocateByWeightBps,
  ceilPercentOfCents,
  centsToUsd,
  normaliseWeights,
} from "@/lib/finance/allocation";

/**
 * Deterministic guardrail engine.
 *
 * This module is the only authority that can block an AI proposal. It is pure: no database, no
 * network, no clock other than the one passed in. Every rule below is testable in isolation,
 * which is the point — a policy engine that cannot be tested cannot be trusted.
 */

export type OpportunityView = {
  id: string;
  strategyType: StrategyType;
  protocolSlug: string;
  protocolName: string;
  chainId: number;
  chainName: string;
  /** Human label, e.g. "USDC" or "USDC/USDT 0.01%". */
  assetLabel: string;
  /** Exposure key: the asset or pair the capital is actually exposed to. */
  assetKey: string;
  expectedRatePercent: number | null;
  rateType: string | null;
  status: string;
  dataMode: string;
  expiresAt: Date | null;
  liquidityUsd: number | null;
  /** Only meaningful for arbitrage; null means "not established". */
  expectedProfitUsd: number | null;
  /** Risk flags from the opportunity record; used by the deterministic planner's scoring. */
  riskFlags?: string[];
};

export type PortfolioExposure = {
  totalUsdCents: bigint;
  availableUsdCents: bigint;
  byChain: Record<string, bigint>;
  byProtocol: Record<string, bigint>;
  byStrategy: Record<string, bigint>;
  byAsset: Record<string, bigint>;
};

export type PolicyInput = {
  proposal: AiProposal;
  guardrails: Guardrails;
  opportunities: OpportunityView[];
  portfolio: PortfolioExposure;
  now: Date;
};

const MAX_LIQUIDITY_SHARE = 0.25;

function pct(part: bigint, whole: bigint): number {
  if (whole <= 0n) return 0;
  return (Number(part) / Number(whole)) * 100;
}

export function evaluateProposal(input: PolicyInput): PolicyEvaluation {
  const { proposal, guardrails, portfolio, now } = input;
  const violations: Violation[] = [];
  const byId = new Map(input.opportunities.map((o) => [o.id, o]));

  const error = (v: Omit<Violation, "severity">) => violations.push({ ...v, severity: "error" });
  const warn = (v: Omit<Violation, "severity">) => violations.push({ ...v, severity: "warning" });
  const info = (v: Omit<Violation, "severity">) => violations.push({ ...v, severity: "info" });

  const total = portfolio.totalUsdCents;
  // Reserve rounds up: withholding a fraction less than the configured minimum would make the
  // engine report a violation of the guardrail it just enforced.
  const reserveCents = ceilPercentOfCents(total, guardrails.minLiquidPercent);
  const deployableCents = total > reserveCents ? total - reserveCents : 0n;
  // A plan may deliberately deploy less than the maximum (e.g. when caps bind).
  const targetCents = (deployableCents * BigInt(proposal.deployBps ?? 10_000)) / 10_000n;

  if (proposal.legs.length === 0) {
    error({ code: "no_legs", message: "The proposal contains no allocations." });
    return finish({ legs: [], violations, total, reserveCents, deployableCents, allocated: 0n });
  }

  // ---- Resolve every leg before evaluating any of it. Unknown references are fatal. ----
  const resolved: Array<{ leg: (typeof proposal.legs)[number]; opportunity: OpportunityView }> = [];
  for (const leg of proposal.legs) {
    const opportunity = byId.get(leg.opportunityId);
    if (!opportunity) {
      error({
        code: "opportunity_not_found",
        message: `Opportunity ${leg.opportunityId} is not in the current candidate set.`,
        context: { opportunityId: leg.opportunityId },
      });
      continue;
    }
    resolved.push({ leg, opportunity });
  }

  if (resolved.length === 0) {
    return finish({ legs: [], violations, total, reserveCents, deployableCents, allocated: 0n });
  }

  // ---- Per-leg static checks ----
  for (const { leg, opportunity } of resolved) {
    if (opportunity.status !== "active") {
      error({
        code: "opportunity_not_active",
        message: `${opportunity.protocolName} ${opportunity.assetLabel} is ${opportunity.status}, not active.`,
        context: { opportunityId: opportunity.id, status: opportunity.status },
      });
    }
    if (opportunity.expiresAt && opportunity.expiresAt.getTime() <= now.getTime()) {
      error({
        code: "opportunity_expired",
        message: `${opportunity.protocolName} ${opportunity.assetLabel} expired at ${opportunity.expiresAt.toISOString()}.`,
        context: { opportunityId: opportunity.id, expiresAt: opportunity.expiresAt.toISOString() },
      });
    }
    if (opportunity.expectedRatePercent === null && opportunity.strategyType !== "arbitrage") {
      warn({
        code: "opportunity_unpriced",
        message: `${opportunity.protocolName} ${opportunity.assetLabel} has no sourced rate; ranking used liquidity only.`,
        context: { opportunityId: opportunity.id },
      });
    }
    if (guardrails.approvedChainIds && !guardrails.approvedChainIds.includes(opportunity.chainId)) {
      error({
        code: "chain_not_approved",
        message: `${opportunity.chainName} (${opportunity.chainId}) is not an approved chain.`,
        context: { opportunityId: opportunity.id, chainId: opportunity.chainId },
      });
    }
    if (
      guardrails.approvedProtocols &&
      !guardrails.approvedProtocols.includes(opportunity.protocolSlug)
    ) {
      error({
        code: "protocol_not_approved",
        message: `${opportunity.protocolName} is not an approved protocol.`,
        context: { opportunityId: opportunity.id, protocol: opportunity.protocolSlug },
      });
    }
    if (leg.weightBps < 0 || leg.weightBps > 10_000) {
      error({
        code: "weights_zero",
        message: "Allocation weight is out of range.",
        context: { opportunityId: opportunity.id, weightBps: leg.weightBps },
      });
    }
  }

  // ---- Weights: normalise deterministically and say so. ----
  const rawWeights = resolved.map((r) => r.leg.weightBps);
  const weightSum = rawWeights.reduce((sum, w) => sum + w, 0);
  if (weightSum === 0) {
    error({ code: "weights_zero", message: "Every allocation weight is zero." });
    return finish({ legs: [], violations, total, reserveCents, deployableCents, allocated: 0n });
  }
  const weights = normaliseWeights(rawWeights) ?? rawWeights;
  if (weights.some((w, i) => w !== rawWeights[i])) {
    info({
      code: "weights_normalized",
      message: `Weights summed to ${weightSum} bps and were normalised to 10 000 bps by the policy engine.`,
      context: { originalSum: weightSum },
    });
  }

  const amounts = allocateByWeightBps(targetCents, weights);
  const allocatedCents = amounts.reduce((sum, a) => sum + a, 0n);

  // ---- Reserve ----
  const reservePercent = pct(reserveCents, total);
  if (reservePercent + 1e-9 < guardrails.minLiquidPercent) {
    error({
      code: "liquid_reserve_below_minimum",
      message: `Liquid reserve is ${reservePercent.toFixed(1)}% but the guardrail requires at least ${guardrails.minLiquidPercent}%.`,
      context: { actual: reservePercent, limit: guardrails.minLiquidPercent },
    });
  }

  // ---- Available balance ----
  if (allocatedCents > portfolio.availableUsdCents) {
    error({
      code: "insufficient_available_balance",
      message: `Plan deploys ${centsToUsd(allocatedCents).toFixed(2)} USD but only ${centsToUsd(portfolio.availableUsdCents).toFixed(2)} USD is available.`,
      context: {
        requiredUsd: centsToUsd(allocatedCents),
        availableUsd: centsToUsd(portfolio.availableUsdCents),
      },
    });
  }

  // ---- Concentration ----
  const chainTotals = { ...portfolio.byChain };
  const protocolTotals = { ...portfolio.byProtocol };
  const strategyTotals = { ...portfolio.byStrategy };
  const assetTotals = { ...portfolio.byAsset };

  const legs: PlannedLeg[] = [];

  resolved.forEach(({ leg, opportunity }, index) => {
    const amountCents = amounts[index] ?? 0n;
    const chainKey = String(opportunity.chainId);

    chainTotals[chainKey] = (chainTotals[chainKey] ?? 0n) + amountCents;
    protocolTotals[opportunity.protocolSlug] =
      (protocolTotals[opportunity.protocolSlug] ?? 0n) + amountCents;
    strategyTotals[opportunity.strategyType] =
      (strategyTotals[opportunity.strategyType] ?? 0n) + amountCents;
    assetTotals[opportunity.assetKey] = (assetTotals[opportunity.assetKey] ?? 0n) + amountCents;

    if (opportunity.strategyType === "arbitrage") {
      if (opportunity.expectedProfitUsd === null) {
        warn({
          code: "arbitrage_profit_below_minimum",
          message:
            "Arbitrage leg has no executable-cost profit estimate. It cannot be treated as profitable until a quote establishes one.",
          context: { opportunityId: opportunity.id },
        });
      } else if (opportunity.expectedProfitUsd < guardrails.minArbitrageProfitUsd) {
        error({
          code: "arbitrage_profit_below_minimum",
          message: `Estimated net profit ${opportunity.expectedProfitUsd.toFixed(2)} USD is below the minimum of ${guardrails.minArbitrageProfitUsd} USD.`,
          context: {
            opportunityId: opportunity.id,
            actual: opportunity.expectedProfitUsd,
            limit: guardrails.minArbitrageProfitUsd,
          },
        });
      }
    }

    if (opportunity.dataMode !== "live") {
      warn({
        code: "sample_data_in_plan",
        message: `${opportunity.protocolName} ${opportunity.assetLabel} uses ${opportunity.dataMode} data; the plan is not based on live market rates.`,
        context: { opportunityId: opportunity.id, dataMode: opportunity.dataMode },
      });
    }

    if (opportunity.liquidityUsd && opportunity.liquidityUsd > 0) {
      const share = centsToUsd(amountCents) / opportunity.liquidityUsd;
      if (share > MAX_LIQUIDITY_SHARE) {
        warn({
          code: "slippage_above_maximum",
          message: `Leg is ${(share * 100).toFixed(1)}% of pool liquidity; expect slippage above the ${guardrails.maxSlippageBps} bps tolerance.`,
          context: { opportunityId: opportunity.id, share },
        });
      }
    }

    legs.push({
      opportunityId: opportunity.id,
      strategyType: opportunity.strategyType,
      protocolSlug: opportunity.protocolSlug,
      protocolName: opportunity.protocolName,
      chainId: opportunity.chainId,
      chainName: opportunity.chainName,
      asset: opportunity.assetLabel,
      weightBps: weights[index] ?? 0,
      amountUsdCents: amountCents.toString(),
      amountUsd: centsToUsd(amountCents),
      rationale: leg.rationale,
      dataMode: opportunity.dataMode,
      expectedRatePercent: opportunity.expectedRatePercent,
      rateType: opportunity.rateType,
    });
  });

  const checkCap = (
    label: "protocol" | "asset" | "chain" | "strategy",
    key: string,
    totals: Record<string, bigint>,
    limitPercent: number,
    code: Violation["code"],
  ) => {
    // A 100% cap cannot be exceeded: exposure is measured against the same total. Treating it as
    // a real limit would only make rounding decisions look like violations.
    if (limitPercent >= 100) return;
    const value = totals[key] ?? 0n;
    const actual = pct(value, total);
    if (actual > limitPercent + 1e-9) {
      error({
        code,
        message: `${label} "${key}" would be ${actual.toFixed(1)}% of the portfolio, above the ${limitPercent}% cap.`,
        context: { [label]: key, actual, limit: limitPercent },
      });
    }
  };

  for (const key of new Set([
    ...Object.keys(protocolTotals),
    ...legs.map((l) => l.protocolSlug),
  ])) {
    checkCap("protocol", key, protocolTotals, guardrails.maxProtocolExposurePercent, "exposure_protocol_exceeded");
  }
  for (const key of new Set([...Object.keys(assetTotals), ...legs.map((l) => l.asset)])) {
    checkCap("asset", key, assetTotals, guardrails.maxAssetExposurePercent, "exposure_asset_exceeded");
  }
  for (const key of new Set([...Object.keys(chainTotals), ...legs.map((l) => String(l.chainId))])) {
    checkCap("chain", key, chainTotals, guardrails.maxChainExposurePercent, "exposure_chain_exceeded");
  }
  for (const key of new Set([...Object.keys(strategyTotals), ...legs.map((l) => l.strategyType)])) {
    checkCap("strategy", key, strategyTotals, guardrails.maxStrategyExposurePercent, "exposure_strategy_exceeded");
  }

  if (guardrails.requiresUserApproval) {
    info({
      code: "user_approval_required",
      message: "Execution requires an explicit human approval and a wallet signature.",
    });
  }

  return finish({ legs, violations, total, reserveCents, deployableCents, allocated: allocatedCents });
}

function finish(args: {
  legs: PlannedLeg[];
  violations: Violation[];
  total: bigint;
  reserveCents: bigint;
  deployableCents: bigint;
  allocated: bigint;
}): PolicyEvaluation {
  return {
    ok: !args.violations.some((v) => v.severity === "error"),
    legs: args.legs,
    violations: args.violations,
    totals: {
      totalUsd: centsToUsd(args.total),
      deployableUsd: centsToUsd(args.deployableCents),
      reserveUsd: centsToUsd(args.reserveCents),
      reservePercent: pct(args.reserveCents, args.total),
      allocatedUsd: centsToUsd(args.allocated),
    },
  };
}
