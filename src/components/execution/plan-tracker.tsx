"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Check, ExternalLink, Loader2, RotateCcw, X } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import type { PlanStepView, PlanView } from "@/lib/execution/plan/http";
import { formatUsd } from "@/lib/format";
import { displayAmount } from "@/lib/ui/amount";
import { cn } from "@/lib/ui/cn";
import { sendFromWallet } from "@/lib/wallet/actions";
import { amountText, ChecksSummary, StepIcon } from "./plan-client";

const EXPLORERS: Record<number, string> = { 8453: "https://basescan.org", 42161: "https://arbiscan.io", 1: "https://etherscan.io" };
const CHAIN: Record<number, string> = { 8453: "Base", 42161: "Arbitrum", 1: "Ethereum" };

const STATUS_LABEL: Record<PlanStepView["status"], string> = {
  pending: "Waiting",
  ready: "Ready",
  awaiting_signature: "Sign in wallet",
  submitted: "Submitted",
  settling: "Settling",
  done: "Done",
  failed: "Failed",
  refunded: "Refunded",
  skipped: "Skipped",
};

/** Vertical stepper for one plan. Polls while running; each read advances or reconciles it. */
export function PlanTracker({ initial }: { initial: PlanView }) {
  const [plan, setPlan] = useState(initial);
  const [signing, setSigning] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/plans/${plan.id}`, { cache: "no-store" });
      const json = (await response.json()) as { data?: PlanView };
      if (json.data) setPlan(json.data);
    } catch {
      // Transient: the next poll retries.
    }
  }, [plan.id]);

  useEffect(() => {
    if (plan.status !== "running") return;
    const timer = setInterval(refresh, plan.simulated ? 1200 : 4000);
    return () => clearInterval(timer);
  }, [plan.status, plan.simulated, refresh]);

  const sign = async (step: PlanStepView) => {
    setSigning(step.index);
    setError(null);
    try {
      const prepared = await fetch(`/api/plans/${plan.id}/steps/${step.index}/prepare`, { method: "POST", headers: { "content-type": "application/json" } });
      const prepJson = (await prepared.json()) as { data?: { instruction: { chainId: number; to: string; data: string; value: string } }; error?: { message: string } };
      if (!prepared.ok || !prepJson.data) {
        setError(prepJson.error?.message ?? "Couldn't prepare this step.");
        return;
      }
      const sent = await sendFromWallet(prepJson.data.instruction, plan.walletAddress);
      if (!sent.ok) {
        if (!sent.rejected) setError(sent.error);
        await refresh();
        return;
      }
      const submitted = await fetch(`/api/plans/${plan.id}/steps/${step.index}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ txHash: sent.value }),
      });
      if (!submitted.ok) {
        const subJson = (await submitted.json()) as { error?: { message: string } };
        setError(subJson.error?.message ?? "Couldn't confirm the transaction.");
      }
      await refresh();
    } finally {
      setSigning(null);
    }
  };

  const cancel = async () => {
    setCancelling(true);
    const response = await fetch(`/api/plans/${plan.id}/cancel`, { method: "POST", headers: { "content-type": "application/json" } });
    if (!response.ok) {
      const json = (await response.json()) as { error?: { message: string } };
      setError(json.error?.message ?? "Couldn't cancel.");
    }
    setCancelling(false);
    await refresh();
  };

  const done = plan.steps.filter((s) => s.status === "done").length;
  const preview = plan.preview;
  const canCancel = plan.status === "draft" || (plan.status === "running" && plan.steps.every((s) => s.status === "pending" || s.status === "ready"));

  return (
    <div className="space-y-6">
      <section className="rounded-[var(--radius-panel)] bg-hero p-6 text-hero-ink">
        <div className="flex items-center justify-between gap-3">
          <PlanStatusTag status={plan.status} />
          {plan.simulated ? <Tag tone="dark">Simulated</Tag> : <Tag tone="dark">Live</Tag>}
        </div>
        <p className="figure mt-5 text-[2.5rem] leading-none">
          {displayAmount(plan.amountAtomic, plan.amountDecimals, 4)} <span className="text-hero-muted">{plan.sourceSymbol}</span>
        </p>
        <p className="mt-2 text-hero-muted">
          {plan.amountUsd !== null ? `${formatUsd(plan.amountUsd)} · ` : ""}
          from {CHAIN[plan.sourceChainId] ?? plan.sourceChainId}
        </p>
        <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-hero-raised" role="progressbar" aria-valuemin={0} aria-valuemax={plan.steps.length} aria-valuenow={done} aria-label="Steps completed">
          <div className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out" style={{ width: `${(done / Math.max(plan.steps.length, 1)) * 100}%` }} />
        </div>
        <p className="mt-2 text-sm text-hero-muted tabular-nums">
          {done} of {plan.steps.length} steps
        </p>
      </section>

      {error ? (
        <p role="alert" className="rounded-[var(--radius-control)] bg-red-50 px-4 py-3 text-sm text-danger-text">
          {error}
        </p>
      ) : null}

      <ol className="relative space-y-0">
        {plan.steps.map((step, index) => {
          const last = index === plan.steps.length - 1;
          const active = ["ready", "awaiting_signature", "submitted", "settling"].includes(step.status);
          return (
            <li key={step.index} className="relative flex gap-4 pb-6">
              {!last ? (
                <span className={cn("absolute top-12 left-[1.4375rem] h-[calc(100%-3rem)] w-px", step.status === "done" ? "bg-accent" : "bg-line")} aria-hidden />
              ) : null}
              <StepBadge step={step} />
              <div className={cn("min-w-0 flex-1 rounded-[var(--radius-panel)] border p-4", active ? "border-ink-faint" : "border-line")}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-ink">{step.title}</p>
                    <p className="mt-0.5 text-sm text-ink-muted tabular-nums">
                      {CHAIN[step.chainId] ?? step.chainId}
                      {step.amountAtomic && step.decimals !== null ? ` · ${displayAmount(step.amountAtomic, step.decimals)} ${step.symbol}` : ""}
                    </p>
                  </div>
                  <span className="flex items-center gap-1.5">
                    {step.simulated ? <Tag tone="sim">Simulated</Tag> : null}
                    <Tag tone={step.status === "done" ? "positive" : step.status === "failed" || step.status === "refunded" ? "negative" : active ? "info" : "neutral"}>
                      {STATUS_LABEL[step.status]}
                    </Tag>
                  </span>
                </div>
                {step.txHash ? (
                  <a
                    href={`${EXPLORERS[step.chainId] ?? EXPLORERS[8453]}/tx/${step.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-1 font-mono text-sm text-ink-secondary hover:text-ink"
                  >
                    {step.txHash.slice(0, 10)}…{step.txHash.slice(-6)}
                    <ExternalLink className="size-3.5" strokeWidth={1.5} aria-hidden />
                  </a>
                ) : step.simulationRef ? (
                  <p className="mt-2 font-mono text-sm text-ink-muted">{step.simulationRef}</p>
                ) : null}
                {step.error ? <p className="mt-2 text-sm text-danger-text">{step.error}</p> : null}
                {!plan.simulated && !step.simulated && (step.status === "ready" || step.status === "awaiting_signature") ? (
                  <button
                    type="button"
                    onClick={() => sign(step)}
                    disabled={signing !== null}
                    data-loading={signing === step.index ? "true" : undefined}
                    className="btn btn-primary mt-3 h-11 w-full"
                  >
                    {signing === step.index ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                    {step.status === "awaiting_signature" ? "Sign again" : "Sign in wallet"}
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      {plan.status === "completed" ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {plan.positionId ? (
            <Link href={`/positions/${plan.positionId}`} className={buttonClass("primary", "xl")}>
              View position
            </Link>
          ) : (
            <Link href="/app" className={buttonClass("primary", "xl")}>
              Back to home
            </Link>
          )}
          <Link href="/activity" className={buttonClass("secondary", "xl")}>
            Activity
          </Link>
        </div>
      ) : null}

      {plan.status === "failed" ? (
        <Link href={plan.opportunityId ? `/opportunities/lending/${plan.opportunityId}` : "/app"} className={buttonClass("secondary", "xl", "w-full")}>
          <RotateCcw className="size-4" strokeWidth={1.5} aria-hidden />
          Try again
        </Link>
      ) : null}

      {canCancel ? (
        <button type="button" onClick={cancel} disabled={cancelling} className="btn btn-ghost h-11 w-full text-ink-secondary">
          Cancel plan
        </button>
      ) : null}

      {preview ? (
        <section className="space-y-3">
          <h2 className="type-card-title text-ink">Details</h2>
          <dl className="space-y-2.5 text-[0.9375rem]">
            {preview.receive ? (
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">{preview.route ? "Minimum received" : "Receives"}</dt>
                <dd className="text-right text-ink tabular-nums">{amountText(preview.receive)}</dd>
              </div>
            ) : null}
            {preview.route ? (
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">Route</dt>
                <dd className="text-right text-ink tabular-nums">
                  1Click{preview.route.costBps !== null ? ` · ${preview.route.costBps.toFixed(2)} bps` : ""} · quoted {new Date(preview.route.quotedAt).toLocaleTimeString()}
                </dd>
              </div>
            ) : null}
            {preview.estYearlyUsd !== null ? (
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">Est. yearly</dt>
                <dd className="text-right text-ink tabular-nums">{formatUsd(preview.estYearlyUsd)}</dd>
              </div>
            ) : null}
          </dl>
          <ChecksSummary checks={preview.checks} />
          {plan.steps.length > 1 ? (
            <p className="text-sm text-pretty text-ink-muted">Steps settle one after another. A failed later step doesn&apos;t undo an earlier one.</p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function StepBadge({ step }: { step: PlanStepView }) {
  const base = "relative z-[1] grid size-12 shrink-0 place-items-center rounded-full";
  if (step.status === "done") {
    return (
      <span className={cn(base, "bg-accent text-ink")}>
        <Check className="size-5" strokeWidth={2} aria-hidden />
      </span>
    );
  }
  if (step.status === "failed" || step.status === "refunded") {
    return (
      <span className={cn(base, "bg-red-50 text-danger-text")}>
        <X className="size-5" strokeWidth={2} aria-hidden />
      </span>
    );
  }
  if (["submitted", "settling", "awaiting_signature"].includes(step.status)) {
    return (
      <span className={cn(base, "bg-hero text-hero-ink")}>
        <Loader2 className="size-5 animate-spin motion-reduce:animate-none" strokeWidth={1.75} aria-hidden />
      </span>
    );
  }
  return (
    <span className={cn(base, step.status === "ready" ? "bg-hero text-hero-ink" : "bg-surface-raised text-ink-secondary")}>
      <StepIcon type={step.type} />
    </span>
  );
}

function PlanStatusTag({ status }: { status: string }) {
  const label: Record<string, string> = {
    draft: "Waiting for approval",
    running: "In progress",
    completed: "Complete",
    failed: "Failed",
    cancelled: "Cancelled",
  };
  return <span className="text-[0.9375rem] text-hero-muted">{label[status] ?? status}</span>;
}
