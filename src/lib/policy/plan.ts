import type { Guardrails } from "@/lib/domain/strategy";
import { MAX_CROSS_CHAIN_SLIPPAGE_BPS, MIN_MOVE_UNITS } from "./execution";

/**
 * Guardrails for one execution plan (lend, deposit, swap, send, withdraw).
 *
 * Each check returns `pass`, `warn` or `block`. A plan with any `block` cannot be approved. Exposure
 * checks only block when *this plan* pushes a bucket over its cap; a bucket that was already over
 * the cap before the plan is a warning, so a user is never locked out of reducing risk elsewhere.
 *
 * Pure: the caller supplies balances, portfolio totals and the clock-free facts.
 */

export type PlanCheckLevel = "pass" | "warn" | "block";

export type PlanCheck = {
  code:
    | "amount_positive"
    | "balance"
    | "minimum_leg"
    | "slippage"
    | "chain_allowed"
    | "protocol_allowed"
    | "protocol_exposure"
    | "chain_exposure"
    | "strategy_exposure"
    | "liquid_reserve"
    | "opportunity_active"
    | "data_freshness"
    | "market_hours"
    | "recipient"
    | "live_support"
    | "route";
  level: PlanCheckLevel;
  label: string;
  detail: string;
};

export type PlanPolicyInput = {
  amountAtomic: bigint;
  balanceAtomic: bigint;
  decimals: number;
  symbol: string;
  /** True when the plan contains a cross-chain 1Click leg. */
  hasCrossChainLeg: boolean;
  /** False for volatile assets: the route minimum is then checked in USD. Defaults to true. */
  isStablecoin?: boolean;
  slippageBps: number;
  guardrails: Guardrails;
  /** Chain the capital ends up on (null for a plan that leaves the portfolio, e.g. send). */
  targetChainId: number | null;
  protocolSlug: string | null;
  strategyType: string | null;
  /** USD value of the amount (valuation only). Null when no price is known. */
  amountUsd: number | null;
  portfolio: {
    totalUsd: number;
    availableUsd: number;
    byProtocolUsd: Record<string, number>;
    byChainUsd: Record<number, number>;
    byStrategyUsd: Record<string, number>;
  } | null;
  /** True when the plan moves capital out of "available" into a position. */
  deploysCapital: boolean;
  opportunity?: { status: string; dataMode: string } | null;
  marketSession?: "OPEN" | "EXTENDED" | "CLOSED" | null;
  isCommodity?: boolean;
  recipientValid?: boolean | null;
  /** Reason a step cannot run in live mode (only checked when the plan would be live). */
  liveUnsupportedReason?: string | null;
};

export type PlanEvaluation = { ok: boolean; checks: PlanCheck[] };

function pct(value: number) {
  return `${value.toFixed(1)}%`;
}

function exposure(
  label: string,
  code: PlanCheck["code"],
  before: number,
  add: number,
  total: number,
  capPercent: number,
): PlanCheck {
  if (total <= 0) return { code, level: "pass", label, detail: "No portfolio value yet." };
  const beforePct = (before / total) * 100;
  const afterPct = ((before + add) / total) * 100;
  if (afterPct <= capPercent) {
    return { code, level: "pass", label, detail: `${pct(afterPct)} of ${pct(capPercent)} cap` };
  }
  if (beforePct > capPercent) {
    return {
      code,
      level: "warn",
      label,
      detail: `Already ${pct(beforePct)}, above the ${pct(capPercent)} cap`,
    };
  }
  return { code, level: "block", label, detail: `Would reach ${pct(afterPct)}; cap is ${pct(capPercent)}` };
}

export function evaluatePlanPolicy(input: PlanPolicyInput): PlanEvaluation {
  const checks: PlanCheck[] = [];
  const g = input.guardrails;

  if (input.amountAtomic <= 0n) {
    checks.push({ code: "amount_positive", level: "block", label: "Amount", detail: "Enter an amount above zero." });
  }

  checks.push(
    input.amountAtomic <= input.balanceAtomic
      ? { code: "balance", level: "pass", label: "Balance", detail: `Enough ${input.symbol}` }
      : { code: "balance", level: "block", label: "Balance", detail: `Not enough ${input.symbol} on this network` },
  );

  if (input.hasCrossChainLeg && input.isStablecoin === false) {
    // A volatile asset's route minimum is a USD value; "5 units" of WETH would be ~$15,000.
    if (input.amountUsd === null) {
      checks.push({ code: "minimum_leg", level: "warn", label: "Route minimum", detail: "No price to check the route minimum" });
    } else {
      checks.push(
        input.amountUsd >= MIN_MOVE_UNITS
          ? { code: "minimum_leg", level: "pass", label: "Route minimum", detail: `At least $${MIN_MOVE_UNITS}` }
          : {
              code: "minimum_leg",
              level: "block",
              label: "Route minimum",
              detail: `Cross-chain routes need at least $${MIN_MOVE_UNITS}`,
            },
      );
    }
  }

  if (input.hasCrossChainLeg) {
    const minimum = BigInt(MIN_MOVE_UNITS) * 10n ** BigInt(input.decimals);
    if (input.isStablecoin !== false) checks.push(
      input.amountAtomic >= minimum
        ? { code: "minimum_leg", level: "pass", label: "Route minimum", detail: `At least ${MIN_MOVE_UNITS} ${input.symbol}` }
        : {
            code: "minimum_leg",
            level: "block",
            label: "Route minimum",
            detail: `Cross-chain routes need at least ${MIN_MOVE_UNITS} ${input.symbol}`,
          },
    );
    const ceiling = Math.min(g.maxSlippageBps, MAX_CROSS_CHAIN_SLIPPAGE_BPS);
    checks.push(
      input.slippageBps <= ceiling
        ? { code: "slippage", level: "pass", label: "Slippage", detail: `${(input.slippageBps / 100).toFixed(2)}% max` }
        : {
            code: "slippage",
            level: "block",
            label: "Slippage",
            detail: `Above the ${(ceiling / 100).toFixed(2)}% limit`,
          },
    );
  }

  if (input.targetChainId !== null && g.approvedChainIds && !g.approvedChainIds.includes(input.targetChainId)) {
    checks.push({ code: "chain_allowed", level: "block", label: "Network", detail: "Not in your approved networks" });
  } else if (input.targetChainId !== null) {
    checks.push({ code: "chain_allowed", level: "pass", label: "Network", detail: "Approved" });
  }

  if (input.protocolSlug) {
    if (g.approvedProtocols && !g.approvedProtocols.includes(input.protocolSlug)) {
      checks.push({ code: "protocol_allowed", level: "block", label: "Protocol", detail: "Not in your approved protocols" });
    } else {
      checks.push({ code: "protocol_allowed", level: "pass", label: "Protocol", detail: "Approved" });
    }
  }

  if (input.opportunity) {
    if (input.opportunity.status !== "active") {
      checks.push({
        code: "opportunity_active",
        level: "block",
        label: "Market status",
        detail: `Market is ${input.opportunity.status}`,
      });
    }
    if (input.opportunity.dataMode === "sample") {
      checks.push({ code: "data_freshness", level: "warn", label: "Data", detail: "Sample data, not a live rate" });
    }
  }

  if (input.marketSession) {
    if (input.marketSession === "CLOSED" && !input.isCommodity) {
      checks.push({ code: "market_hours", level: "block", label: "Market hours", detail: "Underlying market is closed" });
    } else if (input.marketSession === "EXTENDED") {
      checks.push({ code: "market_hours", level: "warn", label: "Market hours", detail: "Extended hours, wider spreads" });
    } else {
      checks.push({ code: "market_hours", level: "pass", label: "Market hours", detail: input.isCommodity ? "Trades 24/7" : "Open" });
    }
  }

  if (input.recipientValid === false) {
    checks.push({ code: "recipient", level: "block", label: "Recipient", detail: "Not a valid address" });
  }

  if (input.deploysCapital && input.portfolio && input.amountUsd !== null) {
    const p = input.portfolio;
    if (input.protocolSlug) {
      checks.push(
        exposure(
          "Protocol exposure",
          "protocol_exposure",
          p.byProtocolUsd[input.protocolSlug] ?? 0,
          input.amountUsd,
          p.totalUsd,
          g.maxProtocolExposurePercent,
        ),
      );
    }
    if (input.strategyType) {
      checks.push(
        exposure(
          "Strategy exposure",
          "strategy_exposure",
          p.byStrategyUsd[input.strategyType] ?? 0,
          input.amountUsd,
          p.totalUsd,
          g.maxStrategyExposurePercent,
        ),
      );
    }
    if (p.totalUsd > 0) {
      const liquidBefore = (p.availableUsd / p.totalUsd) * 100;
      const liquidAfter = ((p.availableUsd - input.amountUsd) / p.totalUsd) * 100;
      if (liquidAfter >= g.minLiquidPercent) {
        checks.push({
          code: "liquid_reserve",
          level: "pass",
          label: "Liquid reserve",
          detail: `${pct(liquidAfter)} stays available`,
        });
      } else if (liquidBefore < g.minLiquidPercent) {
        checks.push({
          code: "liquid_reserve",
          level: "warn",
          label: "Liquid reserve",
          detail: `Already below the ${pct(g.minLiquidPercent)} reserve`,
        });
      } else {
        checks.push({
          code: "liquid_reserve",
          level: "block",
          label: "Liquid reserve",
          detail: `Leaves ${pct(Math.max(liquidAfter, 0))}; keep ${pct(g.minLiquidPercent)}`,
        });
      }
    }
  }

  if (input.liveUnsupportedReason) {
    checks.push({ code: "live_support", level: "block", label: "Live execution", detail: input.liveUnsupportedReason });
  }

  return { ok: !checks.some((check) => check.level === "block"), checks };
}
