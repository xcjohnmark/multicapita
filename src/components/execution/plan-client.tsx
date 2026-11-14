"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowLeftRight,
  BadgeCheck,
  CheckCircle2,
  CircleAlert,
  CircleX,
  Landmark,
  Loader2,
  Send,
  ShieldCheck,
  Vault,
  Waypoints,
} from "lucide-react";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Tag } from "@/components/ui/tag";
import type { PlanPreview, SerializedStep } from "@/lib/execution/plan/preview";
import type { PlanCheck } from "@/lib/policy/plan";
import { formatUsd } from "@/lib/format";
import { displayAmount } from "@/lib/ui/amount";
import { cn } from "@/lib/ui/cn";

/** Shared client pieces for every Execute surface (opportunity, position, swap, send). */

export type PlanRequestBody = Record<string, unknown> & { kind: string };

type PreviewState =
  | { status: "idle" }
  | { status: "loading"; last: PlanPreview | null }
  | { status: "ready"; preview: PlanPreview }
  | { status: "error"; message: string };

/** Debounced live preview: real dry quote + guardrails, recomputed as the user types. */
export function usePlanPreview(body: PlanRequestBody | null, delayMs = 450): PreviewState {
  const key = body ? JSON.stringify(body) : null;
  // The latest settled result and the request it belongs to. "Loading" is derived: a key with no
  // result yet. Only the async callback sets state, so typing never cascades renders.
  const [settled, setSettled] = useState<{ key: string; state: PreviewState; lastReady: PlanPreview | null } | null>(null);

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      let next: PreviewState;
      try {
        const response = await fetch("/api/plans/preview", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: key,
        });
        const json = (await response.json()) as { data?: PlanPreview; error?: { message: string } };
        next = !response.ok || !json.data ? { status: "error", message: json.error?.message ?? "Preview failed." } : { status: "ready", preview: json.data };
      } catch {
        next = { status: "error", message: "Couldn't reach the server." };
      }
      if (!cancelled) {
        setSettled((prev) => ({ key, state: next, lastReady: next.status === "ready" ? next.preview : (prev?.lastReady ?? null) }));
      }
    }, delayMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key, delayMs]);

  if (!key) return { status: "idle" };
  if (settled?.key === key) return settled.state;
  return { status: "loading", last: settled?.lastReady ?? null };
}

export function previewOf(state: PreviewState): PlanPreview | null {
  return state.status === "ready" ? state.preview : state.status === "loading" ? state.last : null;
}

export function amountText(view: { atomic: string; decimals: number; symbol: string } | null | undefined, max = 6) {
  if (!view) return "—";
  return `${displayAmount(view.atomic, view.decimals, max)} ${view.symbol}`;
}

/** You pay / Route cost / You receive / Est. yearly. */
export function PreviewRows({ state, extra }: { state: PreviewState; extra?: { label: string; value: string }[] }) {
  const preview = previewOf(state);
  const loading = state.status === "loading";
  const rows: { label: string; value: string; muted?: boolean }[] = [];
  if (preview) {
    rows.push({ label: "You pay", value: amountText(preview.amount) });
    if (preview.route) {
      rows.push({
        label: "Route",
        value: `1Click · ${preview.route.costBps !== null ? `${preview.route.costBps.toFixed(2)} bps` : "priced"}${preview.route.timeEstimateSeconds ? ` · ~${preview.route.timeEstimateSeconds}s` : ""}`,
      });
    }
    if (preview.receive) {
      rows.push({
        label: preview.route ? "You receive (min)" : "You receive",
        value: `${amountText(preview.receive)}${preview.receive.usd !== null ? ` · ${formatUsd(preview.receive.usd)}` : ""}`,
      });
    }
    if (preview.estYearlyUsd !== null) rows.push({ label: "Est. yearly", value: `${formatUsd(preview.estYearlyUsd)} at ${preview.ratePercent?.toFixed(2)}% ${preview.rateLabel ?? ""}` });
  }
  for (const row of extra ?? []) rows.push(row);

  return (
    <div className={cn("space-y-2.5 transition-opacity duration-150", loading && "opacity-60")} aria-busy={loading}>
      {state.status === "error" ? (
        <p role="alert" className="text-sm text-danger-text">
          {state.message}
        </p>
      ) : null}
      {preview?.routeError ? (
        <p role="alert" className="text-sm text-danger-text">
          {preview.routeError}
        </p>
      ) : null}
      {rows.map((row) => (
        <div key={row.label} className="flex items-baseline justify-between gap-4 text-[0.9375rem]">
          <span className="shrink-0 text-ink-muted">{row.label}</span>
          <span className="truncate text-right text-ink tabular-nums">{row.value}</span>
        </div>
      ))}
      {!preview && state.status !== "error" ? (
        <div className="space-y-2.5" aria-hidden>
          <div className="skeleton h-5 w-full" />
          <div className="skeleton h-5 w-4/5" />
        </div>
      ) : null}
    </div>
  );
}

export function ChecksSummary({ checks }: { checks: PlanCheck[] }) {
  const blocks = checks.filter((c) => c.level === "block");
  const warns = checks.filter((c) => c.level === "warn");
  return (
    <details className="group rounded-[var(--radius-control)] bg-surface px-4 py-3">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[0.9375rem]">
        <span className="flex items-center gap-2">
          {blocks.length ? (
            <CircleX className="size-5 text-danger-text" strokeWidth={1.75} aria-hidden />
          ) : warns.length ? (
            <CircleAlert className="size-5 text-warn-text" strokeWidth={1.75} aria-hidden />
          ) : (
            <ShieldCheck className="size-5 text-accent-text" strokeWidth={1.75} aria-hidden />
          )}
          <span className="text-ink">
            {blocks.length ? blocks[0].detail : warns.length ? `Guardrails pass · ${warns.length} note${warns.length > 1 ? "s" : ""}` : "Guardrails pass"}
          </span>
        </span>
        <span className="text-sm text-ink-muted group-open:hidden">Details</span>
        <span className="hidden text-sm text-ink-muted group-open:inline">Hide</span>
      </summary>
      <ul className="mt-3 space-y-2 border-t border-line pt-3">
        {checks.map((check, index) => (
          <li key={`${check.code}-${index}`} className="flex items-start justify-between gap-3 text-sm">
            <span className="flex items-center gap-2 text-ink-secondary">
              <span
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  check.level === "pass" ? "bg-accent" : check.level === "warn" ? "bg-warn" : "bg-danger",
                )}
                aria-hidden
              />
              {check.label}
            </span>
            <span className={cn("text-right", check.level === "block" ? "text-danger-text" : "text-ink-muted")}>{check.detail}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

const STEP_ICONS: Partial<Record<SerializedStep["type"], typeof Waypoints>> = {
  bridge: Waypoints,
  swap: ArrowLeftRight,
  approve: BadgeCheck,
  supply: Landmark,
  withdraw: Landmark,
  vault_deposit: Vault,
  vault_redeem: Vault,
  transfer: Send,
  record: CheckCircle2,
};

export function StepIcon({ type, className }: { type: SerializedStep["type"]; className?: string }) {
  const Icon = STEP_ICONS[type] ?? ArrowLeftRight;
  return <Icon className={cn("size-5", className)} strokeWidth={1.5} aria-hidden />;
}

export function StepList({ steps }: { steps: SerializedStep[] }) {
  return (
    <ol className="space-y-2">
      {steps.map((step, index) => (
        <li key={index} className="flex items-center gap-3 rounded-[var(--radius-control)] border border-line px-3 py-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-raised text-ink-secondary">
            <StepIcon type={step.type} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[0.9375rem] text-ink">{step.title}</span>
            {step.amountAtomic && step.decimals !== null ? (
              <span className="block text-sm text-ink-muted tabular-nums">
                {displayAmount(step.amountAtomic, step.decimals)} {step.symbol}
              </span>
            ) : null}
          </span>
          {step.simulationOnly ? <Tag tone="sim">Sim only</Tag> : null}
        </li>
      ))}
    </ol>
  );
}

/**
 * Execute → create the draft (fresh quote) → AlertDialog with the steps and the exact amount →
 * Approve → tracker. Approval is explicit and echoes the exact atomic amount (AGENTS.md rule 1).
 */
export function useExecuteFlow() {
  const router = useRouter();
  const [draft, setDraft] = useState<{ planId: string; preview: PlanPreview } | null>(null);
  const [busy, setBusy] = useState<"create" | "approve" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = async (body: PlanRequestBody) => {
    setBusy("create");
    setError(null);
    try {
      const response = await fetch("/api/plans", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await response.json()) as { data?: { planId: string; preview: PlanPreview }; error?: { message: string } };
      if (!response.ok || !json.data) {
        setError(json.error?.message ?? "Couldn't build the plan.");
        return;
      }
      setDraft(json.data);
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(null);
    }
  };

  const approve = async () => {
    if (!draft) return;
    setBusy("approve");
    setError(null);
    try {
      const response = await fetch(`/api/plans/${draft.planId}/approve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accepted: true, amountAtomic: draft.preview.amount.atomic }),
      });
      const json = (await response.json()) as { error?: { message: string } };
      if (!response.ok) {
        setError(json.error?.message ?? "Approval failed.");
        return;
      }
      router.push(`/plans/${draft.planId}`);
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(null);
    }
  };

  const dialog = (
    <ConfirmDialog
      open={draft !== null}
      onOpenChange={(open) => {
        if (!open && busy !== "approve") {
          setDraft(null);
          setError(null);
        }
      }}
      title={draft?.preview.title ?? "Review"}
      description={
        draft
          ? `${amountText(draft.preview.amount)}${draft.preview.amount.usd !== null ? ` (${formatUsd(draft.preview.amount.usd)})` : ""}`
          : undefined
      }
      confirmLabel={draft?.preview.simulated ? "Approve & simulate" : "Approve & execute"}
      onConfirm={approve}
      confirming={busy === "approve"}
      confirmDisabled={!draft?.preview.ok}
      error={error}
    >
      {draft ? (
        <div className="space-y-4">
          <StepList steps={draft.preview.steps} />
          {draft.preview.steps.length > 1 ? (
            <p className="text-sm text-pretty text-ink-muted">
              {draft.preview.steps.length} independent steps. Each settles on its own; this is not one atomic transaction.
            </p>
          ) : null}
          {draft.preview.simulated ? (
            <p className="flex items-start gap-2 rounded-[var(--radius-control)] bg-violet-50 px-3 py-2.5 text-sm text-violet-800">
              <Tag tone="sim">Simulated</Tag>
              <span className="text-pretty">Real quote, simulated settlement. Nothing is signed or sent.</span>
            </p>
          ) : null}
          {!draft.preview.ok ? <ChecksSummary checks={draft.preview.checks} /> : null}
        </div>
      ) : null}
    </ConfirmDialog>
  );

  return { start, dialog, creating: busy === "create", error: draft ? null : error };
}

export function ExecuteButton({
  label,
  disabledLabel,
  onClick,
  loading,
}: {
  label: string;
  disabledLabel: string | null;
  onClick: () => void;
  loading: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabledLabel !== null || loading}
      data-loading={loading ? "true" : undefined}
      className="btn btn-primary h-14 w-full text-base"
    >
      {loading ? <Loader2 className="size-5 animate-spin" aria-hidden /> : null}
      {disabledLabel ?? label}
    </button>
  );
}
