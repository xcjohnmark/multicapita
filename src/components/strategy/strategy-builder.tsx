"use client";

import Link from "next/link";
import { useState } from "react";
import { StatusDot } from "@/components/ui/primitives";
import { formatPercent, formatUsd } from "@/lib/format";

type Violation = {
  code: string;
  severity: "error" | "warning" | "info";
  message: string;
  context?: Record<string, string | number | boolean | null>;
};

type Leg = {
  opportunityId: string;
  protocolName: string;
  strategyType: string;
  chainName: string;
  asset: string;
  weightBps: number;
  amountUsd: number;
  expectedRatePercent: number | null;
  rationale: string;
  dataMode: string;
};

type ProposeResponse = {
  id: string;
  source: "model" | "deterministic_fallback";
  modelId: string | null;
  proposal: {
    objectiveSummary: string;
    legs: Array<{ opportunityId: string; weightBps: number; rationale: string }>;
    deployBps: number;
    riskNotes: string[];
    requiresUserInput: string[];
  };
  evaluation: {
    ok: boolean;
    legs: Leg[];
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

export function StrategyBuilder({
  aiConfigured,
  defaults,
}: {
  aiConfigured: boolean;
  defaults: {
    totalUsd: number;
    availableUsd: number;
    minLiquidPercent: number;
    maxProtocol: number;
    maxChain: number;
    maxStrategy: number;
  };
}) {
  const [objective, setObjective] = useState(
    "Keep at least 30% liquid, avoid concentrating more than 40% in one protocol, and take the best risk-adjusted stablecoin yield across Base and Arbitrum.",
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProposeResponse | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/strategy/propose", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ objective }),
      });
      const body = (await response.json()) as { data?: ProposeResponse; error?: { message: string } };
      if (!response.ok || !body.data) {
        setError(body.error?.message ?? "The proposal request failed.");
        setResult(null);
        return;
      }
      setResult(body.data);
    } catch {
      setError("Could not reach the server. Check the dev server logs.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <form onSubmit={submit} className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow mb-1">Objective</p>
              <h2 className="text-sm font-semibold">What should the portfolio do?</h2>
            </div>
            <span className="chip">
              <StatusDot tone={aiConfigured ? "ok" : "warn"} />
              {aiConfigured ? "NEAR AI Cloud" : "Deterministic planner"}
            </span>
          </div>
          <div className="space-y-3 px-4 py-4">
            <label htmlFor="objective" className="sr-only">
              Objective
            </label>
            <textarea
              id="objective"
              value={objective}
              onChange={(event) => setObjective(event.target.value)}
              rows={3}
              maxLength={1_000}
              className="w-full resize-y rounded-md border border-line bg-canvas px-3 py-2 text-sm text-ink placeholder:text-ink-faint"
              placeholder="Describe the outcome you want, and any constraints."
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-ink-faint">
                The model selects opportunities. Sizing, rounding and every constraint check happen
                in deterministic code.
              </p>
              <button type="submit" className="btn btn-primary" disabled={pending}>
                {pending ? "Evaluating…" : "Propose allocation"}
              </button>
            </div>
            {!aiConfigured ? (
              <p className="rounded-md border border-warn/30 bg-warn/[0.06] px-3 py-2 text-xs text-ink-muted">
                No <code className="font-mono">NEARAI_API_KEY</code> configured. Requests use the
                deterministic planner — a real ranking and sizing engine, not a stub. Add a key to
                route the same request through NEAR AI Cloud.
              </p>
            ) : null}
          </div>
        </form>

        {error ? (
          <div className="rounded-panel border border-danger/30 bg-danger/[0.06] px-4 py-3 text-sm text-ink">
            <span className="font-semibold text-danger">Request failed. </span>
            {error}
          </div>
        ) : null}

        {result ? <ResultPanel result={result} /> : null}
      </div>

      <aside className="space-y-6">
        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow mb-1">Enforced</p>
              <h2 className="text-sm font-semibold">Guardrails</h2>
            </div>
          </div>
          <dl className="space-y-2.5 px-4 py-4 text-xs">
            <Row label="Portfolio" value={formatUsd(defaults.totalUsd)} />
            <Row label="Available" value={formatUsd(defaults.availableUsd)} />
            <Row label="Min liquid reserve" value={`${defaults.minLiquidPercent}%`} />
            <Row label="Max per protocol" value={`${defaults.maxProtocol}%`} />
            <Row label="Max per chain" value={`${defaults.maxChain}%`} />
            <Row label="Max per strategy" value={`${defaults.maxStrategy}%`} />
          </dl>
          <p className="border-t border-line px-4 py-3 text-[11px] leading-relaxed text-ink-faint">
            These are applied by the policy engine after the model answers. A proposal that breaks
            one is returned with its violations and cannot be executed.
          </p>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow mb-1">Pipeline</p>
              <h2 className="text-sm font-semibold">Who decides what</h2>
            </div>
          </div>
          <ol className="space-y-3 px-4 py-4 text-xs text-ink-muted">
            <Step n="1" title="AI selects">
              Reads portfolio and opportunities through read-only tools and proposes weights.
            </Step>
            <Step n="2" title="Code sizes">
              Converts weights to exact cents, applies caps, rounds deterministically.
            </Step>
            <Step n="3" title="Policy enforces">
              Independently re-checks every cap and returns machine-readable violations.
            </Step>
            <Step n="4" title="You approve">
              Nothing executes without a fresh quote, a wallet signature and your approval.
            </Step>
          </ol>
        </section>
      </aside>
    </div>
  );
}

function ResultPanel({ result }: { result: ProposeResponse }) {
  const { evaluation, proposal } = result;
  const violations = [...evaluation.violations].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );
  const errors = violations.filter((v) => v.severity === "error");

  return (
    <section className="panel">
      <div className="panel-header">
        <div className="min-w-0">
          <p className="eyebrow mb-1">Proposal</p>
          <h2 className="truncate text-sm font-semibold">{proposal.objectiveSummary}</h2>
        </div>
        <span
          className={`chip ${evaluation.ok ? "border-accent/30 text-accent" : "border-danger/30 text-danger"}`}
        >
          <StatusDot tone={evaluation.ok ? "ok" : "error"} />
          {evaluation.ok ? "Passed guardrails" : `${errors.length} blocking issue${errors.length === 1 ? "" : "s"}`}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line px-4 py-2.5 text-[11px] text-ink-faint">
        <span>
          Source:{" "}
          <span className="text-ink-muted">
            {result.source === "model" ? result.modelId ?? "model" : "deterministic planner"}
          </span>
        </span>
        <span>
          Deploying <span className="metric text-ink-muted">{formatUsd(evaluation.totals.allocatedUsd)}</span> of{" "}
          <span className="metric text-ink-muted">{formatUsd(evaluation.totals.deployableUsd)}</span> deployable
        </span>
        <span>
          Reserve <span className="metric text-ink-muted">{formatUsd(evaluation.totals.reserveUsd)}</span>
        </span>
      </div>

      {evaluation.legs.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="px-4 py-2 text-xs font-medium text-ink-faint">Allocation</th>
                <th className="px-4 py-2 text-xs font-medium text-ink-faint">Chain</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-ink-faint">Rate</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-ink-faint">Weight</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-ink-faint">Amount</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-ink-faint">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {evaluation.legs.map((leg) => (
                <tr key={leg.opportunityId}>
                  <td className="px-4 py-3">
                    <p className="text-ink">
                      {leg.protocolName} · {leg.asset}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-faint">{leg.rationale}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-muted">{leg.chainName}</td>
                  <td className="px-4 py-3 text-right metric text-ink-muted" data-numeric>
                    {formatPercent(leg.expectedRatePercent)}
                  </td>
                  <td className="px-4 py-3 text-right metric text-ink-muted" data-numeric>
                    {(leg.weightBps / 100).toFixed(1)}%
                  </td>
                  <td className="px-4 py-3 text-right metric text-ink" data-numeric>
                    {formatUsd(leg.amountUsd)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/execute?direction=${leg.chainName.toLowerCase().includes("arb") ? "base-to-arb" : "arb-to-base"}&amount=${Math.round(leg.amountUsd)}`}
                      className="btn btn-secondary px-2.5 py-1 text-xs"
                    >
                      Move funds →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-4 py-6 text-sm text-ink-muted">
          No capital would be allocated under the current guardrails.
        </p>
      )}

      {violations.length > 0 ? (
        <div className="border-t border-line">
          <p className="eyebrow px-4 pt-3">Policy findings</p>
          <ul className="space-y-1.5 px-4 py-3">
            {violations.map((violation, index) => (
              <li key={`${violation.code}-${index}`} className="flex gap-2 text-xs">
                <span className="mt-1 shrink-0">
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
                <span className={violation.severity === "error" ? "text-ink" : "text-ink-muted"}>
                  <span className="font-mono text-[10px] uppercase tracking-wide text-ink-faint">
                    {violation.code}
                  </span>
                  <br />
                  {violation.message}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {proposal.riskNotes.length > 0 || proposal.requiresUserInput.length > 0 ? (
        <div className="space-y-3 border-t border-line px-4 py-3">
          {proposal.riskNotes.length > 0 ? (
            <div>
              <p className="eyebrow mb-1.5">Risk notes</p>
              <ul className="list-disc space-y-1 pl-4 text-xs text-ink-muted">
                {proposal.riskNotes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {proposal.requiresUserInput.length > 0 ? (
            <div>
              <p className="eyebrow mb-1.5">Needs your decision</p>
              <ul className="list-disc space-y-1 pl-4 text-xs text-warn">
                {proposal.requiresUserInput.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <details className="border-t border-line">
        <summary className="cursor-pointer px-4 py-2.5 text-xs text-ink-faint">
          Execution trace ({result.trace.length} steps)
        </summary>
        <ol className="space-y-1 px-4 pb-3 font-mono text-[11px] text-ink-faint">
          {result.trace.map((step, index) => (
            <li key={`${step.step}-${index}`}>
              <span className="text-ink-muted">{step.step}</span> · {step.detail}
            </li>
          ))}
        </ol>
      </details>

      <p className="border-t border-line px-4 py-3 text-[11px] leading-relaxed text-ink-faint">
        A passing proposal is not an executable order. Execution requires a fresh provider quote, a
        wallet signature and explicit approval. Multi-leg strategies are not atomic.
      </p>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-ink-faint">{label}</dt>
      <dd className="metric text-ink" data-numeric>
        {value}
      </dd>
    </div>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border border-line-strong text-[10px] text-ink-muted">
        {n}
      </span>
      <span>
        <span className="font-medium text-ink">{title}. </span>
        {children}
      </span>
    </li>
  );
}
