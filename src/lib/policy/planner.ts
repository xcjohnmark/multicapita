import type { AiProposal, Guardrails } from "@/lib/domain/strategy";
import { ceilPercentOfCents } from "@/lib/finance/allocation";
import type { OpportunityView, PortfolioExposure } from "./engine";

/**
 * Deterministic fallback planner.
 *
 * This exists so the product is fully functional with **no AI credentials and no network
 * dependency on a model**. It is also the reference implementation the LLM is compared against:
 * if the two disagree, the disagreement is about *selection*, never about arithmetic.
 *
 * It does not rank by advertised APY alone. The score discounts each risk flag, skips
 * opportunities without a sourced rate, and refuses to auto-plan arbitrage legs whose net profit
 * has not been established by an executable quote.
 */

export type PlannerRejection = { opportunityId: string; reason: string };

export type PlannerResult = {
  proposal: AiProposal;
  considered: number;
  rejected: PlannerRejection[];
};

/** Below this, fixed per-quote fees dominate: 10 USDC Earn quotes returned "no liquidity". */
const MIN_LEG_CENTS = 1_000n;
/** Never take more than this share of a pool's stated liquidity in one leg. */
const MAX_LIQUIDITY_SHARE = 0.1;
/**
 * Hard caps are enforced exactly by the policy engine. Because a plan expresses amounts as
 * basis points of a total, rounding can push a cap-bound leg a hair over. The planner therefore
 * sizes to 99.9% of each cap: a small deliberate buffer instead of a tolerance inside the engine.
 */
const CAP_SAFETY_BPS = 9_990n;
/** Each risk flag costs this much headline yield in the ranking. */
const RISK_PENALTY_PERCENT = 0.35;

function score(opportunity: OpportunityView): number {
  const rate = opportunity.expectedRatePercent ?? 0;
  const flags = opportunity.riskFlags?.length ?? 0;
  return rate - flags * RISK_PENALTY_PERCENT;
}

export function planDeterministicAllocation(input: {
  guardrails: Guardrails;
  opportunities: OpportunityView[];
  portfolio: PortfolioExposure;
  now: Date;
}): PlannerResult {
  const { guardrails, portfolio, now } = input;
  const rejected: PlannerRejection[] = [];

  const total = portfolio.totalUsdCents;
  const reserveCents = ceilPercentOfCents(total, guardrails.minLiquidPercent);
  const deployableCents = total > reserveCents ? total - reserveCents : 0n;

  const eligible = input.opportunities.filter((opportunity) => {
    if (opportunity.status !== "active") {
      rejected.push({ opportunityId: opportunity.id, reason: `status is ${opportunity.status}` });
      return false;
    }
    if (opportunity.expiresAt && opportunity.expiresAt.getTime() <= now.getTime()) {
      rejected.push({ opportunityId: opportunity.id, reason: "expired" });
      return false;
    }
    if (guardrails.approvedChainIds && !guardrails.approvedChainIds.includes(opportunity.chainId)) {
      rejected.push({ opportunityId: opportunity.id, reason: "chain not approved" });
      return false;
    }
    if (
      guardrails.approvedProtocols &&
      !guardrails.approvedProtocols.includes(opportunity.protocolSlug)
    ) {
      rejected.push({ opportunityId: opportunity.id, reason: "protocol not approved" });
      return false;
    }
    if (opportunity.strategyType === "arbitrage" && opportunity.expectedProfitUsd === null) {
      rejected.push({
        opportunityId: opportunity.id,
        reason: "arbitrage net profit is not established by an executable quote",
      });
      return false;
    }
    if (opportunity.strategyType !== "arbitrage" && opportunity.expectedRatePercent === null) {
      rejected.push({ opportunityId: opportunity.id, reason: "no sourced rate" });
      return false;
    }
    if (opportunity.liquidityUsd !== null && opportunity.liquidityUsd <= 0) {
      rejected.push({ opportunityId: opportunity.id, reason: "no stated liquidity" });
      return false;
    }
    return true;
  });

  const ranked = [...eligible].sort((a, b) => {
    const delta = score(b) - score(a);
    if (Math.abs(delta) > 1e-9) return delta;
    return a.id.localeCompare(b.id); // deterministic tie-break
  });

  const chainTotals = { ...portfolio.byChain };
  const protocolTotals = { ...portfolio.byProtocol };
  const strategyTotals = { ...portfolio.byStrategy };
  const assetTotals = { ...portfolio.byAsset };

  let remaining = deployableCents > portfolio.availableUsdCents
    ? portfolio.availableUsdCents
    : deployableCents;
  let allocated = 0n;

  const picks: Array<{ opportunity: OpportunityView; cents: bigint }> = [];

  for (const opportunity of ranked) {
    if (remaining < MIN_LEG_CENTS) break;

    const capRemaining = (existing: bigint | undefined, capPercent: number): bigint => {
      // A 100% cap is vacuous (see the engine): it never constrains, so it must not acquire a
      // safety margin and silently forbid deployment.
      if (capPercent >= 100) return remaining;
      const capCents = (ceilPercentOfCents(total, capPercent) * CAP_SAFETY_BPS) / 10_000n;
      const used = existing ?? 0n;
      return capCents > used ? capCents - used : 0n;
    };

    const chainKey = String(opportunity.chainId);
    const limits = [
      remaining,
      capRemaining(protocolTotals[opportunity.protocolSlug], guardrails.maxProtocolExposurePercent),
      capRemaining(chainTotals[chainKey], guardrails.maxChainExposurePercent),
      capRemaining(strategyTotals[opportunity.strategyType], guardrails.maxStrategyExposurePercent),
      capRemaining(assetTotals[opportunity.assetKey], guardrails.maxAssetExposurePercent),
    ];

    if (opportunity.liquidityUsd && opportunity.liquidityUsd > 0) {
      const liquidityCap = BigInt(Math.floor(opportunity.liquidityUsd * MAX_LIQUIDITY_SHARE * 100));
      limits.push((liquidityCap * CAP_SAFETY_BPS) / 10_000n);
    }

    const amount = limits.reduce((min, value) => (value < min ? value : min));

    if (amount < MIN_LEG_CENTS) {
      rejected.push({
        opportunityId: opportunity.id,
        reason: "headroom below the minimum leg size after applying exposure caps",
      });
      continue;
    }

    picks.push({ opportunity, cents: amount });
    allocated += amount;
    remaining -= amount;

    protocolTotals[opportunity.protocolSlug] = (protocolTotals[opportunity.protocolSlug] ?? 0n) + amount;
    chainTotals[chainKey] = (chainTotals[chainKey] ?? 0n) + amount;
    strategyTotals[opportunity.strategyType] =
      (strategyTotals[opportunity.strategyType] ?? 0n) + amount;
    assetTotals[opportunity.assetKey] = (assetTotals[opportunity.assetKey] ?? 0n) + amount;
  }

  if (picks.length === 0) {
    return {
      proposal: {
        objectiveSummary:
          "No eligible opportunity passed the guardrails, so no capital was allocated.",
        legs: [],
        deployBps: 0,
        riskNotes: [],
        requiresUserInput: [
          "Relax a guardrail or add a candidate with a sourced rate before this can be planned.",
        ],
      },
      considered: input.opportunities.length,
      rejected,
    };
  }

  const deployBps =
    deployableCents > 0n ? Number((allocated * 10_000n) / deployableCents) : 0;

  // Weights are relative to what is actually being deployed.
  const rawWeights = picks.map((p) => Number((p.cents * 10_000n) / allocated));
  const weightDrift = 10_000 - rawWeights.reduce((sum, w) => sum + w, 0);
  if (weightDrift !== 0) {
    let target = 0;
    for (let i = 1; i < rawWeights.length; i += 1) {
      if (rawWeights[i] > rawWeights[target]) target = i;
    }
    rawWeights[target] += weightDrift;
  }

  const bestScore = score(picks[0].opportunity);
  const riskNotes: string[] = [];
  if (deployBps < 10_000) {
    riskNotes.push(
      "Concentration caps leave part of the deployable amount undeployed; it stays liquid.",
    );
  }
  if (picks.some((p) => p.opportunity.dataMode !== "live")) {
    riskNotes.push(
      "At least one leg uses sample or cached data. Rates must be refreshed from a live source before execution.",
    );
  }
  if (picks.some((p) => p.opportunity.strategyType === "arbitrage")) {
    riskNotes.push(
      "Arbitrage legs settle separately and are not atomic. Profit is only real after both legs confirm.",
    );
  }

  return {
    proposal: {
      objectiveSummary: `Deterministic allocation across ${picks.length} opportunit${picks.length === 1 ? "y" : "ies"}, ranked by risk-adjusted rate rather than headline APY.`,
      legs: picks.map((pick, index) => ({
        opportunityId: pick.opportunity.id,
        weightBps: rawWeights[index],
        rationale: buildRationale(pick.opportunity, bestScore),
      })),
      deployBps,
      riskNotes,
      requiresUserInput: [],
    },
    considered: input.opportunities.length,
    rejected,
  };
}

function buildRationale(opportunity: OpportunityView, bestScore: number): string {
  const rate =
    opportunity.expectedRatePercent === null
      ? "a profit estimate from an executable quote"
      : `${opportunity.expectedRatePercent.toFixed(2)}% ${opportunity.rateType ?? "rate"}`;
  const flags = opportunity.riskFlags?.length ?? 0;
  const penalty = flags === 0 ? "no risk flags" : `${flags} risk flag${flags === 1 ? "" : "s"}`;
  const lead = Math.abs(score(opportunity) - bestScore) < 1e-9 ? "Top-ranked by" : "Ranked by";

  // No dollar figure here on purpose: the policy engine recomputes exact cents after weighting,
  // so a number written by the planner would not match the amount actually allocated.
  return `${lead} risk-adjusted yield: ${rate} on ${opportunity.chainName} with ${penalty}. Sized by the policy engine inside the concentration caps.`;
}
