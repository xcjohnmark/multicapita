"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Play } from "lucide-react";
import { amountText, ChecksSummary } from "@/components/execution/plan-client";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Tag } from "@/components/ui/tag";
import type { PlanPreview } from "@/lib/execution/plan/preview";
import { formatUsd } from "@/lib/format";

type Draft = { planId: string; preview: PlanPreview };

/**
 * Strategy → one plan per leg → one confirmation listing every leg's exact amount → approve each.
 * Legs settle independently; the dialog says so (AGENTS.md rule 6).
 */
export function StrategyExecute({ proposalId }: { proposalId: string }) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [busy, setBusy] = useState<"build" | "approve" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const build = async () => {
    setBusy("build");
    setError(null);
    try {
      const response = await fetch("/api/strategy/plans", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ proposalId }),
      });
      const json = (await response.json()) as { data?: { plans: Draft[] }; error?: { message: string } };
      if (!response.ok || !json.data) {
        setError(json.error?.message ?? "Couldn't build the plans.");
        return;
      }
      setDrafts(json.data.plans);
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(null);
    }
  };

  const approveAll = async () => {
    if (!drafts) return;
    setBusy("approve");
    setError(null);
    try {
      for (const draft of drafts.filter((d) => d.preview.ok)) {
        const response = await fetch(`/api/plans/${draft.planId}/approve`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ accepted: true, amountAtomic: draft.preview.amount.atomic }),
        });
        if (!response.ok) {
          const json = (await response.json()) as { error?: { message: string } };
          setError(`${draft.preview.title}: ${json.error?.message ?? "approval failed"}`);
          return;
        }
      }
      await fetch("/api/strategy/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ proposalId }),
      }).catch(() => undefined);
      router.push("/activity");
    } finally {
      setBusy(null);
    }
  };

  const runnable = drafts?.filter((d) => d.preview.ok) ?? [];
  const totalUsd = runnable.reduce((sum, d) => sum + (d.preview.amount.usd ?? 0), 0);
  const simulated = drafts?.some((d) => d.preview.simulated) ?? true;

  return (
    <>
      <button type="button" onClick={build} disabled={busy !== null} className="btn btn-primary h-11 px-5">
        {busy === "build" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Play className="size-4" strokeWidth={1.75} aria-hidden />}
        Review &amp; run
      </button>
      {error && !drafts ? (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      ) : null}
      <ConfirmDialog
        open={drafts !== null}
        onOpenChange={(open) => {
          if (!open && busy !== "approve") {
            setDrafts(null);
            setError(null);
          }
        }}
        title={`Run ${runnable.length} plan${runnable.length === 1 ? "" : "s"}`}
        description={`${formatUsd(totalUsd)} in total`}
        confirmLabel={simulated ? "Approve all & simulate" : "Approve all"}
        onConfirm={approveAll}
        confirming={busy === "approve"}
        confirmDisabled={runnable.length === 0}
        error={error}
      >
        <ul className="space-y-2">
          {drafts?.map((draft) => (
            <li key={draft.planId} className="rounded-[var(--radius-control)] border border-line px-3 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate text-[0.9375rem] text-ink">{draft.preview.title}</span>
                  <span className="block text-sm text-ink-muted tabular-nums">
                    {amountText(draft.preview.amount, 2)} · {draft.preview.steps.length} steps
                  </span>
                </span>
                {draft.preview.ok ? <Tag tone="positive">Ready</Tag> : <Tag tone="negative">Blocked</Tag>}
              </div>
              {!draft.preview.ok ? (
                <div className="mt-2">
                  <ChecksSummary checks={draft.preview.checks} />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-pretty text-ink-muted">Each plan settles on its own. Blocked legs are skipped.</p>
      </ConfirmDialog>
    </>
  );
}
