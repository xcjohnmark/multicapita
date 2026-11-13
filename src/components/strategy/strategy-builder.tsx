"use client";

import { useState } from "react";
import { Loader2, RotateCcw, ShieldCheck, SlidersHorizontal, Sparkles } from "lucide-react";
import {
  StrategyPackageCard,
  type ProposeResponse,
} from "@/components/strategy/strategy-package-card";
import { StatusDot } from "@/components/ui/primitives";
import { formatUsd } from "@/lib/format";

type GuardrailOverrides = {
  minLiquidPercent: number;
  maxProtocolExposurePercent: number;
  maxChainExposurePercent: number;
  maxStrategyExposurePercent: number;
};

type CustomLegDraft = {
  opportunityId: string;
  label: string;
  weightPercent: number;
};

const PRESET_OBJECTIVES = [
  {
    label: "Stable yield",
    text: "Keep at least 30% liquid, cap any protocol at 40%, and allocate to the best risk-adjusted stablecoin yield across Base and Arbitrum.",
  },
  {
    label: "Balanced Base + Arb",
    text: "Balance lending and yield vaults evenly across Base and Arbitrum while keeping 30% liquid.",
  },
  {
    label: "Arbitrage scan",
    text: "Check cross-chain arbitrage spreads across Base and Arbitrum and deploy only if net profit clears costs and guardrails.",
  },
  {
    label: "Conservative",
    text: "Keep 50% liquid reserve and place the rest into established Aave lending markets on Base.",
  },
] as const;

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
  const [objective, setObjective] = useState<string>(PRESET_OBJECTIVES[0].text);
  const [pending, setPending] = useState(false);
  const [reEvaluating, setReEvaluating] = useState(false);
  const [guardrailsSaved, setGuardrailsSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProposeResponse | null>(null);

  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [overrides, setOverrides] = useState<GuardrailOverrides>({
    minLiquidPercent: defaults.minLiquidPercent,
    maxProtocolExposurePercent: defaults.maxProtocol,
    maxChainExposurePercent: defaults.maxChain,
    maxStrategyExposurePercent: defaults.maxStrategy,
  });
  const [legDrafts, setLegDrafts] = useState<CustomLegDraft[]>([]);

  function seedCustomDrafts(data: ProposeResponse) {
    setLegDrafts(
      data.evaluation.legs.map((leg) => ({
        opportunityId: leg.opportunityId,
        label: `${leg.protocolName} · ${leg.asset} (${leg.chainName})`,
        weightPercent: Math.round(leg.weightBps / 100),
      })),
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/strategy/propose", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ objective, guardrailOverrides: overrides }),
      });
      const body = (await response.json()) as {
        data?: ProposeResponse;
        error?: { message: string };
      };
      if (!response.ok || !body.data) {
        setError(body.error?.message ?? "The proposal request failed.");
        setResult(null);
        return;
      }
      setResult(body.data);
      seedCustomDrafts(body.data);
      setCustomizeOpen(false);
    } catch {
      setError("Could not reach the server. Check the dev server logs.");
    } finally {
      setPending(false);
    }
  }

  async function applyCustomization(event: React.FormEvent) {
    event.preventDefault();
    setReEvaluating(true);
    setGuardrailsSaved(false);
    setError(null);
    try {
      const customLegs =
        legDrafts.length > 0
          ? legDrafts
              .filter((d) => d.weightPercent > 0)
              .map((d) => ({
                opportunityId: d.opportunityId,
                weightBps: Math.round(d.weightPercent * 100),
              }))
          : undefined;

      const [constraintRes, response] = await Promise.all([
        fetch("/api/strategy/constraints", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(overrides),
        }),
        fetch("/api/strategy/propose", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            objective,
            guardrailOverrides: overrides,
            customLegs,
          }),
        }),
      ]);

      if (constraintRes.ok) {
        setGuardrailsSaved(true);
      }

      const body = (await response.json()) as {
        data?: ProposeResponse;
        error?: { message: string };
      };
      if (!response.ok || !body.data) {
        setError(body.error?.message ?? "Custom evaluation failed.");
        return;
      }
      setResult(body.data);
      seedCustomDrafts(body.data);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setReEvaluating(false);
    }
  }

  function resetOverrides() {
    setOverrides({
      minLiquidPercent: defaults.minLiquidPercent,
      maxProtocolExposurePercent: defaults.maxProtocol,
      maxChainExposurePercent: defaults.maxChain,
      maxStrategyExposurePercent: defaults.maxStrategy,
    });
    if (result) seedCustomDrafts(result);
  }

  const totalDraftPercent = legDrafts.reduce((sum, leg) => sum + leg.weightPercent, 0);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <form onSubmit={submit} className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow mb-1">Objective</p>
              <h2 className="type-card-title text-ink">
                What should the portfolio do?
              </h2>
            </div>
            <span className="chip">
              <StatusDot tone={aiConfigured ? "ok" : "warn"} />
              {aiConfigured ? "NEAR AI Cloud" : "Deterministic planner"}
            </span>
          </div>

          <div className="space-y-3.5 px-5 py-4">
            <div className="flex flex-wrap gap-1.5">
              {PRESET_OBJECTIVES.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setObjective(preset.text)}
                  className={`chip cursor-pointer transition-colors duration-100 hover:border-line-strong hover:text-ink ${
                    objective === preset.text ? "border-ink bg-surface-raised text-ink" : ""
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <label htmlFor="objective" className="sr-only">
              Objective
            </label>
            <textarea
              id="objective"
              value={objective}
              onChange={(event) => setObjective(event.target.value)}
              rows={3}
              maxLength={1_000}
              className="w-full resize-y rounded-lg border border-line-strong bg-canvas px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none"
              placeholder="Describe the outcome you want, and any constraints."
            />

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-ink-muted">
                Returns a packaged strategy card checked against deterministic guardrails.
              </p>
              <button
                type="submit"
                className="btn btn-primary h-9 px-4 text-sm"
                disabled={pending || reEvaluating}
                data-loading={pending ? "true" : undefined}
              >
                {pending ? (
                  <Loader2 className="size-4 animate-spin" strokeWidth={1.5} aria-hidden />
                ) : (
                  <Sparkles className="size-4" strokeWidth={1.5} aria-hidden />
                )}
                <span>{pending ? "Building strategy…" : "Propose strategy"}</span>
              </button>
            </div>

            {!aiConfigured ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50/70 px-3.5 py-2.5 text-xs text-ink-secondary">
                No <code className="font-mono text-ink">NEARAI_API_KEY</code> configured. Requests
                use the deterministic planner — a real ranking and sizing engine, not a stub. Add a
                key to route the same request through NEAR AI Cloud.
              </p>
            ) : null}
          </div>
        </form>

        {error ? (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-ink"
          >
            <span className="font-medium text-danger-text">Request failed. </span>
            {error}
          </div>
        ) : null}

        {result ? (
          <>
            <StrategyPackageCard
              result={result}
              customizeOpen={customizeOpen}
              onOpenCustomize={() => setCustomizeOpen((prev) => !prev)}
            />

            {customizeOpen ? (
              <form onSubmit={applyCustomization} className="panel">
                <div className="panel-header">
                  <div className="flex items-center gap-2">
                    <SlidersHorizontal
                      className="size-4 text-ink-secondary"
                      strokeWidth={1.5}
                      aria-hidden
                    />
                    <div>
                      <p className="eyebrow">Customize plan</p>
                      <h3 className="text-sm font-medium text-ink">
                        Adjust weights &amp; policy caps
                      </h3>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={resetOverrides}
                    className="btn btn-ghost h-8 px-2.5 text-xs text-ink-muted"
                  >
                    <RotateCcw className="size-3.5" strokeWidth={1.5} aria-hidden />
                    <span>Reset</span>
                  </button>
                </div>

                <div className="space-y-5 px-5 py-4">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <NumberField
                      id="minLiquid"
                      label="Min liquid (%)"
                      value={overrides.minLiquidPercent}
                      onChange={(val) =>
                        setOverrides((prev) => ({ ...prev, minLiquidPercent: val }))
                      }
                    />
                    <NumberField
                      id="maxProtocol"
                      label="Max protocol (%)"
                      value={overrides.maxProtocolExposurePercent}
                      onChange={(val) =>
                        setOverrides((prev) => ({ ...prev, maxProtocolExposurePercent: val }))
                      }
                    />
                    <NumberField
                      id="maxChain"
                      label="Max chain (%)"
                      value={overrides.maxChainExposurePercent}
                      onChange={(val) =>
                        setOverrides((prev) => ({ ...prev, maxChainExposurePercent: val }))
                      }
                    />
                    <NumberField
                      id="maxStrategy"
                      label="Max strategy (%)"
                      value={overrides.maxStrategyExposurePercent}
                      onChange={(val) =>
                        setOverrides((prev) => ({ ...prev, maxStrategyExposurePercent: val }))
                      }
                    />
                  </div>

                  {legDrafts.length > 0 ? (
                    <div className="space-y-2.5 border-t border-line pt-4">
                      <div className="flex items-center justify-between">
                        <p className="eyebrow">Leg allocation weights</p>
                        <span
                          className={`metric text-xs font-medium ${
                            totalDraftPercent === 100 ? "text-accent-text" : "text-warn-text"
                          }`}
                        >
                          Total: {totalDraftPercent}%
                        </span>
                      </div>

                      <div className="space-y-2">
                        {legDrafts.map((leg, idx) => (
                          <div
                            key={leg.opportunityId}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface px-3.5 py-2.5"
                          >
                            <span className="text-xs font-medium text-ink">{leg.label}</span>
                            <div className="flex items-center gap-2">
                              <input
                                type="range"
                                min={0}
                                max={100}
                                step={5}
                                value={leg.weightPercent}
                                aria-label={`${leg.label} weight percentage`}
                                onChange={(e) => {
                                  const next = Number(e.target.value);
                                  setLegDrafts((prev) =>
                                    prev.map((item, i) =>
                                      i === idx ? { ...item, weightPercent: next } : item,
                                    ),
                                  );
                                }}
                                className="w-28 accent-green-600"
                              />
                              <span className="metric w-11 text-right text-xs font-medium text-ink">
                                {leg.weightPercent}%
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3.5">
                    <p className="text-xs text-ink-muted">
                      {guardrailsSaved
                        ? "Guardrail caps persisted to your profile and checked by the policy engine."
                        : "Weights are normalized, saved to your profile, and checked by the policy engine."}
                    </p>
                    <button
                      type="submit"
                      disabled={reEvaluating || pending}
                      data-loading={reEvaluating ? "true" : undefined}
                      className="btn btn-primary h-9 px-4 text-xs"
                    >
                      {reEvaluating ? (
                        <Loader2 className="size-3.5 animate-spin" strokeWidth={1.5} aria-hidden />
                      ) : (
                        <ShieldCheck className="size-3.5" strokeWidth={1.5} aria-hidden />
                      )}
                      <span>{reEvaluating ? "Saving & checking…" : "Save & re-evaluate"}</span>
                    </button>
                  </div>
                </div>
              </form>
            ) : null}
          </>
        ) : null}
      </div>

      <aside className="space-y-6">
        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow mb-1">Enforced</p>
              <h2 className="type-card-title text-ink">Guardrails</h2>
            </div>
          </div>
          <dl className="space-y-2.5 px-5 py-4 text-xs">
            <Row label="Portfolio" value={formatUsd(defaults.totalUsd)} />
            <Row label="Available" value={formatUsd(defaults.availableUsd)} />
            <Row label="Min liquid reserve" value={`${overrides.minLiquidPercent}%`} />
            <Row label="Max per protocol" value={`${overrides.maxProtocolExposurePercent}%`} />
            <Row label="Max per chain" value={`${overrides.maxChainExposurePercent}%`} />
            <Row label="Max per strategy" value={`${overrides.maxStrategyExposurePercent}%`} />
          </dl>
          <p className="border-t border-line bg-surface px-5 py-3 text-xs leading-relaxed text-ink-muted">
            Applied deterministically after the model answers. A plan that breaks a cap returns
            violations and cannot execute.
          </p>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow mb-1">Pipeline</p>
              <h2 className="type-card-title text-ink">Who decides what</h2>
            </div>
          </div>
          <ol className="space-y-3 px-5 py-4 text-xs text-ink-secondary">
            <Step n="1" title="AI packages">
              Selects opportunities and frames a concise, categorized strategy card.
            </Step>
            <Step n="2" title="Code sizes">
              Converts weights to exact cents, applies caps, rounds deterministically.
            </Step>
            <Step n="3" title="Policy enforces">
              Independently re-checks every cap and returns machine-readable violations.
            </Step>
            <Step n="4" title="You customize &amp; approve">
              Adjust weights or caps, inspect the deep dive, and sign each leg in Execute.
            </Step>
          </ol>
        </section>
      </aside>
    </div>
  );
}

function NumberField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="eyebrow mb-1 block">
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={0}
        max={100}
        value={value}
        onChange={(e) => {
          const next = Number(e.target.value);
          if (!Number.isNaN(next)) onChange(Math.max(0, Math.min(100, next)));
        }}
        className="h-9 w-full rounded-lg border border-line-strong bg-canvas px-3 font-mono text-xs text-ink focus:border-ink focus:outline-none"
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="metric font-medium text-ink" data-numeric>
        {value}
      </dd>
    </div>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface text-xs font-medium text-ink-secondary">
        {n}
      </span>
      <span>
        <span className="font-medium text-ink">{title}. </span>
        {children}
      </span>
    </li>
  );
}
