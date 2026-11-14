"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AmountInput } from "@/components/ui/amount-input";
import { buttonClass } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { SelectMenu } from "@/components/ui/select-menu";
import { TokenOnChain } from "@/components/ui/token-stack";
import { parseDecimalToAtomic } from "@/lib/finance/amounts";
import { displayAmount, inputAmount, shareInput } from "@/lib/ui/amount";
import { ChecksSummary, ExecuteButton, PreviewRows, previewOf, useExecuteFlow, usePlanPreview } from "./plan-client";

/** Withdraw / Collect / Add on a position. Exits are plans too: preview, guardrails, approval. */
export function ExitPanel({
  positionId,
  chainId,
  asset,
  maxAtomic,
  canCollect,
  addHref,
  simulated,
  closed,
}: {
  positionId: string;
  chainId: number;
  asset: { symbol: string; decimals: number };
  maxAtomic: string;
  canCollect: boolean;
  addHref: string | null;
  simulated: boolean;
  closed: boolean;
}) {
  const [mode, setMode] = useState<"withdraw" | "collect" | "add">("withdraw");
  const [amount, setAmount] = useState("");
  const [deliver, setDeliver] = useState(String(chainId));
  const isUsdc = asset.symbol === "USDC";

  const atomic = useMemo(() => {
    if (!amount) return null;
    try {
      return parseDecimalToAtomic(amount, asset.decimals);
    } catch {
      return null;
    }
  }, [amount, asset.decimals]);
  const over = atomic !== null && atomic > BigInt(maxAtomic);

  const body =
    mode === "collect"
      ? { kind: "position_exit", positionId, mode: "collect", deliverChainId: null, slippageBps: 50 }
      : mode === "withdraw" && atomic && atomic > 0n
        ? { kind: "position_exit", positionId, mode: "withdraw", amount, deliverChainId: Number(deliver), slippageBps: 50 }
        : null;
  const state = usePlanPreview(body);
  const preview = previewOf(state);
  const flow = useExecuteFlow();

  const modes = [
    { value: "withdraw" as const, label: asset.symbol === "USDC" ? "Withdraw" : "Sell" },
    ...(canCollect ? [{ value: "collect" as const, label: "Collect fees" }] : []),
    ...(addHref ? [{ value: "add" as const, label: "Add" }] : []),
  ];

  if (closed) {
    return <p className="text-ink-muted">This position is closed.</p>;
  }

  return (
    <div className="space-y-4">
      {modes.length > 1 ? (
        <Segmented ariaLabel="Action" value={mode} onValueChange={setMode} options={modes} className="w-full [&>*]:flex-1" />
      ) : null}

      {mode === "add" && addHref ? (
        <div className="space-y-3">
          <p className="text-pretty text-ink-muted">Adding goes through the same market page, with a fresh quote and guardrail check.</p>
          <Link href={addHref} className={buttonClass("primary", "xl", "w-full")}>
            Open market
          </Link>
        </div>
      ) : null}

      {mode === "withdraw" ? (
        <>
          <AmountInput
            value={amount}
            onChange={setAmount}
            symbol={asset.symbol}
            decimals={asset.decimals}
            usdHint={isUsdc && amount ? `$${amount}` : null}
            invalid={over}
            balanceLabel={`In position ${displayAmount(maxAtomic, asset.decimals, 4)} ${asset.symbol}`}
            shortcuts={[{ label: "50%", onSelect: () => setAmount(shareInput(maxAtomic, asset.decimals, 5000)) }]}
            onMax={() => setAmount(inputAmount(maxAtomic, asset.decimals))}
          />
          {[8453, 42161].includes(chainId) ? (
            <SelectMenu
              variant="picker"
              label="Receive on"
              ariaLabel="Receive on"
              value={deliver}
              onValueChange={setDeliver}
              options={[8453, 42161].map((id) => ({
                value: String(id),
                label: id === chainId ? `${id === 8453 ? "Base" : "Arbitrum"} (same network)` : `${id === 8453 ? "Base" : "Arbitrum"} via 1Click`,
                icon: <TokenOnChain symbol="USDC" chainId={id} size="lg" />,
              }))}
            />
          ) : null}
        </>
      ) : null}

      {mode !== "add" && body ? (
        <>
          <PreviewRows state={state} />
          {preview ? <ChecksSummary checks={preview.checks} /> : null}
        </>
      ) : null}

      {flow.error ? (
        <p role="alert" className="text-sm text-danger-text">
          {flow.error}
        </p>
      ) : null}

      {mode !== "add" ? (
        <ExecuteButton
          label={`${mode === "collect" ? "Collect fees" : modes[0].label}${simulated ? " (simulated)" : ""}`}
          disabledLabel={
            mode === "withdraw" && (!atomic || atomic <= 0n)
              ? "Enter an amount"
              : over
                ? "More than the position holds"
                : preview && !preview.ok
                  ? "Blocked by guardrails"
                  : !preview
                    ? "Checking…"
                    : null
          }
          loading={flow.creating}
          onClick={() => body && flow.start(body)}
        />
      ) : null}
      {flow.dialog}
    </div>
  );
}
