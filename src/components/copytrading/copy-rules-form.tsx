"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";

/**
 * Copy rules for one trader. Saved as a subscription; every copied trade still needs the user's
 * approval (agent auto-copy is a separate, opt-in mode the API supports but this form does not).
 */
export function CopyRulesForm({ traderAddress, ecosystem, signedIn }: { traderAddress: string; ecosystem: string; signedIn: boolean }) {
  const [account, setAccount] = useState("");
  const [perTrade, setPerTrade] = useState("50");
  const [daily, setDaily] = useState("200");
  const [scale, setScale] = useState<"500" | "1000" | "2500">("1000");
  const [kinds, setKinds] = useState({ copySpot1Click: true, copyVaults: true, copyLending: true, copyLp: false });
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  if (!signedIn) {
    return (
      <div className="space-y-3">
        <p className="text-pretty text-ink-muted">Sign in to set copy rules. Every copied trade waits for your approval.</p>
        <Link href="/signin" className={buttonClass("primary", "xl", "w-full")}>
          Connect wallet
        </Link>
      </div>
    );
  }

  const save = async () => {
    setState("saving");
    setError(null);
    try {
      const response = await fetch("/api/copytrading/subscriptions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          traderAddress,
          ecosystem,
          fundingNearAccountId: account.trim(),
          executionMode: "approval_required",
          maxUsdPerTrade: Number(perTrade),
          maxDailyBudgetUsd: Number(daily),
          copyScaleBps: Number(scale),
          ...kinds,
        }),
      });
      const json = (await response.json()) as { error?: { message: string } };
      if (!response.ok) {
        setError(json.error?.message ?? "Couldn't save copy rules.");
        setState("idle");
        return;
      }
      setState("saved");
    } catch {
      setError("Couldn't reach the server.");
      setState("idle");
    }
  };

  const toggles: { key: keyof typeof kinds; label: string }[] = [
    { key: "copySpot1Click", label: "Spot swaps" },
    { key: "copyVaults", label: "Vaults" },
    { key: "copyLending", label: "Lending" },
    { key: "copyLp", label: "Pools" },
  ];

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="text-sm text-ink-muted">NEAR account that funds copies</span>
        <span className="field mt-1.5">
          <input value={account} onChange={(e) => setAccount(e.target.value)} placeholder="you.near" autoComplete="off" spellCheck={false} />
        </span>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-sm text-ink-muted">Max per trade</span>
          <span className="field mt-1.5">
            <span className="text-ink-muted">$</span>
            <input inputMode="numeric" value={perTrade} onChange={(e) => setPerTrade(e.target.value.replace(/[^\d]/g, ""))} aria-label="Max per trade in USD" />
          </span>
        </label>
        <label className="block">
          <span className="text-sm text-ink-muted">Max per day</span>
          <span className="field mt-1.5">
            <span className="text-ink-muted">$</span>
            <input inputMode="numeric" value={daily} onChange={(e) => setDaily(e.target.value.replace(/[^\d]/g, ""))} aria-label="Max per day in USD" />
          </span>
        </label>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-ink-muted">Copy size</span>
        <Segmented
          ariaLabel="Copy size"
          size="sm"
          value={scale}
          onValueChange={setScale}
          options={[
            { value: "500", label: "5%" },
            { value: "1000", label: "10%" },
            { value: "2500", label: "25%" },
          ]}
        />
      </div>
      <fieldset>
        <legend className="text-sm text-ink-muted">Copy</legend>
        <div className="mt-2 flex flex-wrap gap-1">
          {toggles.map((t) => (
            <button
              key={t.key}
              type="button"
              aria-pressed={kinds[t.key]}
              onClick={() => setKinds((prev) => ({ ...prev, [t.key]: !prev[t.key] }))}
              className="chip-filter border border-line aria-pressed:border-transparent"
            >
              {kinds[t.key] ? <Check className="size-4" strokeWidth={1.75} aria-hidden /> : null}
              {t.label}
            </button>
          ))}
        </div>
      </fieldset>
      {error ? (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      ) : null}
      <button type="button" onClick={save} disabled={state !== "idle" || !account.trim()} className="btn btn-primary h-14 w-full text-base">
        {state === "saving" ? <Loader2 className="size-5 animate-spin" aria-hidden /> : state === "saved" ? <Check className="size-5" aria-hidden /> : null}
        {state === "saved" ? "Copying, with your approval" : !account.trim() ? "Enter a NEAR account" : "Start copying"}
      </button>
      <p className="text-sm text-pretty text-ink-muted">Memecoins are never copied. Each trade asks you first.</p>
    </div>
  );
}
