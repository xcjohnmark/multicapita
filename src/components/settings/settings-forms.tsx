"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Loader2, RotateCcw } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/dialog";

type Guardrails = {
  minLiquidPercent: number;
  maxProtocolExposurePercent: number;
  maxChainExposurePercent: number;
  maxStrategyExposurePercent: number;
  maxSlippageBps: number;
};

const FIELDS: { key: keyof Guardrails; label: string; hint: string; min: number; max: number; step: number; unit: "%" | "bps" }[] = [
  { key: "minLiquidPercent", label: "Keep liquid", hint: "Share that always stays in your wallet", min: 0, max: 90, step: 5, unit: "%" },
  { key: "maxProtocolExposurePercent", label: "Max per protocol", hint: "No single protocol above this", min: 5, max: 100, step: 5, unit: "%" },
  { key: "maxStrategyExposurePercent", label: "Max per strategy", hint: "Lending, vaults, pools, stocks", min: 5, max: 100, step: 5, unit: "%" },
  { key: "maxChainExposurePercent", label: "Max per network", hint: "Base or Arbitrum", min: 10, max: 100, step: 5, unit: "%" },
  { key: "maxSlippageBps", label: "Max slippage", hint: "On any cross-chain leg", min: 5, max: 100, step: 5, unit: "bps" },
];

/** Guardrails the policy engine enforces on every plan. Edits apply to the next preview. */
export function GuardrailsForm({ initial, readOnly }: { initial: Guardrails; readOnly: boolean }) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  const dirty = FIELDS.some((f) => values[f.key] !== initial[f.key]);

  const save = async () => {
    setState("saving");
    setError(null);
    try {
      const response = await fetch("/api/strategy/constraints", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!response.ok) {
        const json = (await response.json()) as { error?: { message: string } };
        setError(json.error?.message ?? "Couldn't save.");
        setState("idle");
        return;
      }
      setState("saved");
      router.refresh();
      setTimeout(() => setState("idle"), 1500);
    } catch {
      setError("Couldn't reach the server.");
      setState("idle");
    }
  };

  return (
    <div className="space-y-5">
      {FIELDS.map((field) => (
        <label key={field.key} className="block">
          <span className="flex items-baseline justify-between gap-3">
            <span>
              <span className="block text-ink">{field.label}</span>
              <span className="block text-sm text-ink-muted">{field.hint}</span>
            </span>
            <span className="figure text-lg text-ink">
              {field.unit === "bps" ? `${(values[field.key] / 100).toFixed(2)}%` : `${values[field.key]}%`}
            </span>
          </span>
          <input
            type="range"
            min={field.min}
            max={field.max}
            step={field.step}
            value={values[field.key]}
            disabled={readOnly}
            onChange={(event) => setValues((prev) => ({ ...prev, [field.key]: Number(event.target.value) }))}
            className="mt-2 w-full accent-[var(--color-ink)] disabled:opacity-50"
            aria-label={field.label}
          />
        </label>
      ))}
      {error ? (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      ) : null}
      {readOnly ? (
        <p className="text-sm text-pretty text-ink-muted">The demo account&apos;s guardrails are shared by every visitor. Sign in to set your own.</p>
      ) : (
        <button type="button" onClick={save} disabled={!dirty || state === "saving"} className="btn btn-primary h-12 w-full">
          {state === "saving" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : state === "saved" ? <Check className="size-4" aria-hidden /> : null}
          {state === "saved" ? "Saved" : "Save guardrails"}
        </button>
      )}
    </div>
  );
}

export function ResetDemoButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = async () => {
    setBusy(true);
    setError(null);
    const response = await fetch("/api/demo/reset", { method: "POST", headers: { "content-type": "application/json" } });
    setBusy(false);
    if (!response.ok) {
      setError("Couldn't reset.");
      return;
    }
    setOpen(false);
    router.push("/app");
    router.refresh();
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn btn-secondary h-12 w-full">
        <RotateCcw className="size-4" strokeWidth={1.5} aria-hidden />
        Reset simulations
      </button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Reset simulations?"
        description="Removes your simulated plans and positions. Live data and sample data stay as they are."
        confirmLabel="Reset"
        onConfirm={reset}
        confirming={busy}
        error={error}
      />
    </>
  );
}
