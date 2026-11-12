"use client";

import Link from "next/link";
import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  Layers,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { ChainBadge, StatusDot } from "@/components/ui/primitives";
import { formatPercent, formatUsd } from "@/lib/format";

export type StrategyCategory =
  | "yielding"
  | "investing"
  | "tokenized_stock"
  | "arbitraging"
  | "liquidity"
  | "balanced";

export type Violation = {
  code: string;
  severity: "error" | "warning" | "info";
  message: string;
  context?: Record<string, string | number | boolean | null>;
};

export type StrategyLeg = {
  opportunityId: string;
  protocolName: string;
  strategyType: string;
  chainName: string;
  chainId?: number;
  asset: string;
  weightBps: number;
  amountUsd: number;
  expectedRatePercent: number | null;
  rationale: string;
  dataMode: string;
};

export type ProposeResponse = {
  id: string;
  source: "model" | "deterministic_fallback";
  modelId: string | null;
  strategyName?: string;
  category?: StrategyCategory | string;
  summary?: string;
  howItWorks?: string[];
  targetApy?: number | null;
  decisionPoints?: string[];
  proposal: {
    objectiveSummary: string;
    strategyName?: string;
    category?: StrategyCategory | string;
    summary?: string;
    howItWorks?: string[];
    targetApy?: number | null;
    decisionPoints?: string[];
    legs: Array<{ opportunityId: string; weightBps: number; rationale: string }>;
    deployBps: number;
    riskNotes: string[];
    requiresUserInput: string[];
  };
  evaluation: {
    ok: boolean;
    legs: StrategyLeg[];
    violations: Violation[];
    totals: {
      totalUsd: number;
      deployableUsd: number;
      reserveUsd: number;
      reservePercent: number;
      allocatedUsd: number;
    };
  };
  trace: Array<{ step: string; detail: string }>;
  warnings: string[];
};

const SEVERITY_ORDER: Record<Violation["severity"], number> = { error: 0, warning: 1, info: 2 };

const CATEGORY_META: Record<
  string,
  { label: string; badgeClass: string }
> = {
  yielding: {
    label: "Yielding",
    badgeClass: "border-green-200 bg-green-50 text-accent-text",
  },
  investing: {
    label: "Investing",
    badgeClass: "border-blue-200 bg-blue-50 text-blue-700",
  },
  tokenized_stock: {
    label: "Tokenized Stock",
    badgeClass: "border-indigo-200 bg-indigo-50 text-indigo-700",
  },
  arbitraging: {
    label: "Arbitraging",
    badgeClass: "border-amber-200 bg-amber-50 text-amber-800",
  },
  liquidity: {
    label: "Liquidity",
    badgeClass: "border-sky-200 bg-sky-50 text-sky-700",
  },
  balanced: {
    label: "Balanced",
    badgeClass: "border-line-strong bg-surface text-ink-secondary",
  },
};

const SLICE_COLORS = [
  "bg-accent",
  "bg-info",
  "bg-warn",
  "bg-indigo-500",
  "bg-emerald-600",
  "bg-gray-500",
];

function inferCategory(legs: StrategyLeg[]): StrategyCategory {
  if (legs.length === 0) return "balanced";
  const types = new Set(legs.map((l) => l.strategyType));
  if (types.size > 1) return "balanced";
  const only = legs[0]?.strategyType;
  if (only === "arbitrage") return "arbitraging";
  if (only === "stablecoin_lp") return "liquidity";
  if (only === "lending" || only === "yield_vault") return "yielding";
  return "investing";
}

function computeWeightedApy(legs: StrategyLeg[]): number | null {
  let totalWeight = 0;
  let weightedSum = 0;
  for (const leg of legs) {
    if (leg.expectedRatePercent !== null && leg.weightBps > 0) {
      totalWeight += leg.weightBps;
      weightedSum += leg.expectedRatePercent * leg.weightBps;
    }
  }
  return totalWeight > 0 ? weightedSum / totalWeight : null;
}

function buildFallbackSteps(result: ProposeResponse): string[] {
  const { evaluation } = result;
  const steps: string[] = [];
  if (evaluation.totals.reservePercent > 0) {
    steps.push(
      `Retain ${evaluation.totals.reservePercent.toFixed(0)}% (${formatUsd(evaluation.totals.reserveUsd)}) in liquid wallet reserve.`,
    );
  }
  for (const leg of evaluation.legs.slice(0, 2)) {
    steps.push(
      `Allocate ${(leg.weightBps / 100).toFixed(0)}% (${formatUsd(leg.amountUsd)}) into ${leg.protocolName} on ${leg.chainName}.`,
    );
  }
  steps.push("Verify live 1Click quote and sign each leg individually in the execution console.");
  return steps;
}

export function StrategyPackageCard({
  result,
  onOpenCustomize,
  customizeOpen,
}: {
  result: ProposeResponse;
  onOpenCustomize: () => void;
  customizeOpen: boolean;
}) {
  const [deepDiveOpen, setDeepDiveOpen] = useState(false);

  const { evaluation, proposal } = result;
  const violations = [...evaluation.violations].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );
  const errors = violations.filter((v) => v.severity === "error");

  const strategyName =
    result.strategyName ?? proposal.strategyName ?? proposal.objectiveSummary;
  const categoryKey =
    result.category ?? proposal.category ?? inferCategory(evaluation.legs);
  const category = CATEGORY_META[categoryKey] ?? {
    label: categoryKey.replaceAll("_", " "),
    badgeClass: "border-line bg-surface text-ink-secondary",
  };
  const summary =
    result.summary ?? proposal.summary ?? proposal.objectiveSummary;
  const howItWorks =
    result.howItWorks ??
    proposal.howItWorks ??
    buildFallbackSteps(result);
  const targetApy =
    result.targetApy ??
    proposal.targetApy ??
    computeWeightedApy(evaluation.legs);
  const decisionPoints =
    result.decisionPoints ??
    proposal.decisionPoints ??
    proposal.requiresUserInput;

  const primaryLeg = evaluation.legs[0];
  const executeHref = primaryLeg
    ? `/execute?direction=${
        primaryLeg.chainName.toLowerCase().includes("arb") ? "base-to-arb" : "arb-to-base"
      }&amount=${Math.max(1, Math.round(primaryLeg.amountUsd))}`
    : "/execute";

  return (
    <section className="panel overflow-hidden">
      {/* Header: Category + Strategy Name + Guardrail Verdict */}
      <div className="flex flex-col justify-between gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-start">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`chip border text-[11px] font-medium ${category.badgeClass}`}>
              {category.label}
            </span>
            <span className="text-[11px] text-ink-muted">
              {result.source === "model" ? result.modelId ?? "NEAR AI Cloud" : "Deterministic planner"}
            </span>
          </div>
          <h2 className="text-lg font-semibold tracking-tight text-ink">{strategyName}</h2>
          {summary && summary !== strategyName ? (
            <p className="max-w-2xl text-sm leading-relaxed text-ink-secondary">{summary}</p>
          ) : null}
        </div>

        <span
          className={`chip shrink-0 ${
            evaluation.ok
              ? "border-green-200 bg-green-50 text-accent-text"
              : "border-red-200 bg-red-50 text-danger-text"
          }`}
        >
          {evaluation.ok ? (
            <ShieldCheck className="size-3.5" strokeWidth={1.5} aria-hidden />
          ) : (
            <ShieldAlert className="size-3.5" strokeWidth={1.5} aria-hidden />
          )}
          {evaluation.ok
            ? "Passed guardrails"
            : `${errors.length} guardrail violation${errors.length === 1 ? "" : "s"}`}
        </span>
      </div>

      {/* 3-Column KPI Strip */}
      <div className="grid grid-cols-3 divide-x divide-line border-b border-line bg-surface">
        <div className="px-5 py-3.5">
          <p className="eyebrow">Est. Target APY</p>
          <p className="metric mt-1 text-xl font-semibold text-accent-text" data-numeric>
            {targetApy !== null ? formatPercent(targetApy) : "—"}
          </p>
          <p className="mt-0.5 text-[11px] text-ink-muted">Variable · weighted est.</p>
        </div>
        <div className="px-5 py-3.5">
          <p className="eyebrow">Deploying</p>
          <p className="metric mt-1 text-xl font-semibold text-ink" data-numeric>
            {formatUsd(evaluation.totals.allocatedUsd)}
          </p>
          <p className="mt-0.5 text-[11px] text-ink-muted">
            of {formatUsd(evaluation.totals.deployableUsd)} cap
          </p>
        </div>
        <div className="px-5 py-3.5">
          <p className="eyebrow">Liquid Reserve</p>
          <p className="metric mt-1 text-xl font-semibold text-ink" data-numeric>
            {formatUsd(evaluation.totals.reserveUsd)}
          </p>
          <p className="mt-0.5 text-[11px] text-ink-muted">
            {evaluation.totals.reservePercent.toFixed(0)}% liquid buffer
          </p>
        </div>
      </div>

      {/* Packaged Allocation Visual + How It Works */}
      <div className="grid gap-6 px-5 py-5 lg:grid-cols-2">
        <div className="space-y-3">
          <p className="eyebrow">Allocation mix</p>
          {evaluation.legs.length > 0 ? (
            <>
              <div
                className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-surface-raised"
                role="img"
                aria-label="Proposed allocation mix"
              >
                {evaluation.legs.map((leg, i) => (
                  <div
                    key={leg.opportunityId}
                    className={SLICE_COLORS[i % SLICE_COLORS.length]}
                    style={{ width: `${Math.max(4, leg.weightBps / 100)}%` }}
                    title={`${leg.protocolName}: ${(leg.weightBps / 100).toFixed(1)}%`}
                  />
                ))}
              </div>
              <ul className="space-y-2 pt-1">
                {evaluation.legs.map((leg, i) => (
                  <li
                    key={leg.opportunityId}
                    className="flex items-center justify-between gap-2 text-xs"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className={`size-2 shrink-0 rounded-sm ${SLICE_COLORS[i % SLICE_COLORS.length]}`}
                        aria-hidden
                      />
                      <span className="truncate font-medium text-ink">
                        {leg.protocolName} · {leg.asset}
                      </span>
                      <span className="text-ink-muted">({leg.chainName})</span>
                    </span>
                    <span className="metric shrink-0 text-ink" data-numeric>
                      {(leg.weightBps / 100).toFixed(0)}% · {formatUsd(leg.amountUsd)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-xs text-ink-muted">
              No capital allocated under the current guardrails.
            </p>
          )}
        </div>

        <div className="space-y-2.5">
          <p className="eyebrow">How it works</p>
          <ol className="space-y-2 text-xs leading-relaxed text-ink-secondary">
            {howItWorks.slice(0, 4).map((step, index) => (
              <li key={index} className="flex gap-2.5">
                <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface text-[10px] font-semibold text-ink">
                  {index + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* Action Bar: Customize Plan | Deep Dive | Execute */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface px-5 py-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpenCustomize}
            aria-expanded={customizeOpen}
            className={`btn h-9 px-3.5 text-xs ${
              customizeOpen ? "btn-highlight" : "btn-secondary"
            }`}
          >
            <SlidersHorizontal className="size-3.5" strokeWidth={1.5} aria-hidden />
            <span>{customizeOpen ? "Hide customizer" : "Customize plan"}</span>
          </button>

          <button
            type="button"
            onClick={() => setDeepDiveOpen((prev) => !prev)}
            aria-expanded={deepDiveOpen}
            className="btn btn-secondary h-9 px-3.5 text-xs"
          >
            <Layers className="size-3.5" strokeWidth={1.5} aria-hidden />
            <span>Deep dive</span>
            <ChevronDown
              className={`size-3.5 transition-transform duration-100 ${deepDiveOpen ? "rotate-180" : ""}`}
              strokeWidth={1.5}
              aria-hidden
            />
          </button>
        </div>

        {evaluation.ok && evaluation.legs.length > 0 ? (
          <Link href={executeHref} className="btn btn-accent h-9 px-4 text-xs">
            <span>Review in Execution Console</span>
            <ArrowRight className="size-3.5" strokeWidth={1.5} aria-hidden />
          </Link>
        ) : (
          <button type="button" disabled className="btn btn-secondary h-9 px-4 text-xs">
            <span>Blocked by policy engine</span>
          </button>
        )}
      </div>

      {/* Deep Dive Breakdown */}
      {deepDiveOpen ? (
        <div className="border-t border-line bg-canvas">
          {evaluation.legs.length > 0 ? (
            <div className="overflow-x-auto border-b border-line">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="border-b border-line bg-surface text-left">
                    <th className="eyebrow px-5 py-2.5">Leg & Rationale</th>
                    <th className="eyebrow px-5 py-2.5">Chain</th>
                    <th className="eyebrow px-5 py-2.5 text-right">Rate</th>
                    <th className="eyebrow px-5 py-2.5 text-right">Weight</th>
                    <th className="eyebrow px-5 py-2.5 text-right">Amount</th>
                    <th className="eyebrow px-5 py-2.5 text-right">Route</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-faint">
                  {evaluation.legs.map((leg) => (
                    <tr
                      key={leg.opportunityId}
                      className="transition-colors duration-100 hover:bg-surface-hover"
                    >
                      <td className="px-5 py-3">
                        <p className="font-medium text-ink">
                          {leg.protocolName} · {leg.asset}
                        </p>
                        <p className="mt-0.5 max-w-md text-xs text-ink-muted">{leg.rationale}</p>
                      </td>
                      <td className="px-5 py-3">
                        <ChainBadge chainId={leg.chainId} label={leg.chainName} />
                      </td>
                      <td className="px-5 py-3 text-right metric text-ink-secondary" data-numeric>
                        {formatPercent(leg.expectedRatePercent)}
                      </td>
                      <td className="px-5 py-3 text-right metric text-ink-secondary" data-numeric>
                        {(leg.weightBps / 100).toFixed(1)}%
                      </td>
                      <td className="px-5 py-3 text-right metric font-medium text-ink" data-numeric>
                        {formatUsd(leg.amountUsd)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Link
                          href={`/execute?direction=${
                            leg.chainName.toLowerCase().includes("arb")
                              ? "base-to-arb"
                              : "arb-to-base"
                          }&amount=${Math.max(1, Math.round(leg.amountUsd))}`}
                          className="btn btn-secondary h-7 px-2.5 text-xs"
                        >
                          <span>Move</span>
                          <ArrowRight className="size-3" strokeWidth={1.5} aria-hidden />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <div className="grid gap-5 px-5 py-4 lg:grid-cols-2">
            {violations.length > 0 ? (
              <div>
                <p className="eyebrow mb-2">Deterministic policy findings</p>
                <ul className="space-y-2">
                  {violations.map((violation, index) => (
                    <li key={`${violation.code}-${index}`} className="flex gap-2 text-xs">
                      <span className="mt-1.5 shrink-0">
                        <StatusDot
                          tone={
                            violation.severity === "error"
                              ? "error"
                              : violation.severity === "warning"
                                ? "warn"
                                : "idle"
                          }
                        />
                      </span>
                      <span className="text-ink-secondary">
                        <span className="font-mono text-[10px] uppercase text-ink-muted">
                          {violation.code}
                        </span>{" "}
                        {violation.message}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="flex items-start gap-2 text-xs text-ink-secondary">
                <ShieldCheck
                  className="mt-0.5 size-4 shrink-0 text-accent-text"
                  strokeWidth={1.5}
                  aria-hidden
                />
                <span>
                  All deterministic policy checks passed (liquid reserve, protocol cap, chain cap,
                  and strategy cap).
                </span>
              </div>
            )}

            <div className="space-y-3">
              {proposal.riskNotes.length > 0 ? (
                <div>
                  <p className="eyebrow mb-1.5">Key risks</p>
                  <ul className="space-y-1 text-xs text-ink-secondary">
                    {proposal.riskNotes.map((note) => (
                      <li key={note} className="flex items-start gap-1.5">
                        <AlertTriangle
                          className="mt-0.5 size-3.5 shrink-0 text-warn-text"
                          strokeWidth={1.5}
                          aria-hidden
                        />
                        <span>{note}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {decisionPoints.length > 0 ? (
                <div>
                  <p className="eyebrow mb-1.5">Trade-offs & decisions</p>
                  <ul className="list-disc space-y-1 pl-4 text-xs text-warn-text">
                    {decisionPoints.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>

          <details className="border-t border-line">
            <summary className="cursor-pointer px-5 py-2.5 text-xs font-medium text-ink-muted hover:text-ink">
              Audit execution trace ({result.trace.length} steps)
            </summary>
            <ol className="space-y-1 px-5 pb-3.5 font-mono text-[11px] text-ink-muted">
              {result.trace.map((step, index) => (
                <li key={`${step.step}-${index}`}>
                  <span className="font-medium text-ink">{step.step}</span> · {step.detail}
                </li>
              ))}
            </ol>
          </details>

          <p className="border-t border-line bg-surface px-5 py-3 text-[11px] leading-relaxed text-ink-muted">
            A passing proposal is not an executable order. Execution requires a fresh 1Click quote,
            a wallet signature, and explicit approval. Multi-leg strategies are not atomic.
          </p>
        </div>
      ) : null}
    </section>
  );
}
