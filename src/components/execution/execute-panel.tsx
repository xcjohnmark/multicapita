"use client";

import { useMemo, useState } from "react";
import { AmountInput } from "@/components/ui/amount-input";
import { Segmented } from "@/components/ui/segmented";
import { SelectMenu } from "@/components/ui/select-menu";
import { TokenOnChain } from "@/components/ui/token-stack";
import { parseDecimalToAtomic } from "@/lib/finance/amounts";
import { formatUsd } from "@/lib/format";
import { displayAmount, inputAmount, shareInput } from "@/lib/ui/amount";
import { ChecksSummary, ExecuteButton, PreviewRows, previewOf, useExecuteFlow, usePlanPreview } from "./plan-client";

/**
 * The Execute panel on an opportunity's detail page: pay-with, amount, slippage (only when a
 * cross-chain leg exists), live preview, guardrails, Execute. Every number shown comes back from
 * the server's preview; this component does no money maths beyond parsing the typed decimal.
 */

export type FundingSource = {
  /** Live mode: the verified wallet that pays. Simulated: null (all wallets together). */
  walletAddress: string | null;
  chainId: number;
  chainName: string;
  address: string;
  symbol: string;
  decimals: number;
  amountAtomic: string;
  priceUsd: number | null;
};

const SLIPPAGE = [
  { value: "10", label: "0.1%" },
  { value: "50", label: "0.5%" },
  { value: "100", label: "1%" },
] as const;

export function ExecutePanel({
  opportunityId,
  targetChainId,
  sources,
  actionLabel,
  simulated,
  blockedReason,
}: {
  opportunityId: string;
  targetChainId: number;
  sources: FundingSource[];
  actionLabel: string;
  simulated: boolean;
  blockedReason: string | null;
}) {
  const initial = sources.find((s) => s.chainId === targetChainId && BigInt(s.amountAtomic) > 0n) ?? sources.find((s) => BigInt(s.amountAtomic) > 0n) ?? sources[0];
  const keyOf = (s: FundingSource) => `${s.chainId}:${s.walletAddress ?? "all"}`;
  const [sourceKey, setSourceKey] = useState(initial ? keyOf(initial) : "");
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState<(typeof SLIPPAGE)[number]["value"]>("50");
  const source = sources.find((s) => keyOf(s) === sourceKey) ?? null;
  const crossChain = source ? source.chainId !== targetChainId : false;

  const atomic = useMemo(() => {
    if (!source || !amount) return null;
    try {
      return parseDecimalToAtomic(amount, source.decimals);
    } catch {
      return null;
    }
  }, [amount, source]);

  const overBalance = source && atomic !== null ? atomic > BigInt(source.amountAtomic) : false;
  const body =
    source && atomic !== null && atomic > 0n
      ? {
          kind: "opportunity_entry",
          opportunityId,
          amount,
          sourceChainId: source.chainId,
          slippageBps: Number(slippage),
          ...(source.walletAddress ? { walletAddress: source.walletAddress } : {}),
        }
      : null;
  const state = usePlanPreview(body);
  const preview = previewOf(state);
  const flow = useExecuteFlow();
  const usdHint = source?.priceUsd && amount ? formatUsd(Number(amount) * source.priceUsd) : "$0.00";

  const disabledLabel = blockedReason
    ? blockedReason
    : !source
      ? "No funding source"
      : !atomic || atomic <= 0n
        ? "Enter an amount"
        : overBalance
          ? `Not enough ${source.symbol}`
          : state.status === "loading" && !preview
            ? "Checking route…"
            : preview && !preview.ok
              ? "Blocked by guardrails"
              : null;

  return (
    <div className="space-y-4">
      <SelectMenu
        variant="picker"
        label="Pay with"
        ariaLabel="Pay with"
        value={sourceKey}
        onValueChange={(value) => {
          setSourceKey(value);
          setAmount("");
        }}
        options={sources.map((s) => ({
          value: keyOf(s),
          label: `${s.symbol} on ${s.chainName}${s.walletAddress ? ` · ${s.walletAddress.slice(0, 6)}…${s.walletAddress.slice(-4)}` : ""}`,
          icon: <TokenOnChain symbol={s.symbol} chainId={s.chainId} size="lg" />,
          meta: displayAmount(s.amountAtomic, s.decimals, 2),
        }))}
      />

      <AmountInput
        value={amount}
        onChange={setAmount}
        symbol={source?.symbol ?? ""}
        decimals={source?.decimals ?? 6}
        usdHint={usdHint}
        invalid={overBalance}
        balanceLabel={source ? `Balance ${displayAmount(source.amountAtomic, source.decimals, 4)} ${source.symbol}` : null}
        shortcuts={
          source
            ? [
                { label: "25%", onSelect: () => setAmount(shareInput(source.amountAtomic, source.decimals, 2500)) },
                { label: "50%", onSelect: () => setAmount(shareInput(source.amountAtomic, source.decimals, 5000)) },
              ]
            : undefined
        }
        onMax={source ? () => setAmount(inputAmount(source.amountAtomic, source.decimals)) : undefined}
      />

      {crossChain ? (
        <div className="flex items-center justify-between gap-3">
          <span className="text-[0.9375rem] text-ink-muted">Max slippage</span>
          <Segmented ariaLabel="Max slippage" size="sm" value={slippage} onValueChange={setSlippage} options={SLIPPAGE.map((s) => ({ ...s }))} />
        </div>
      ) : null}

      {body ? <PreviewRows state={state} /> : null}
      {preview ? <ChecksSummary checks={preview.checks} /> : null}

      {flow.error ? (
        <p role="alert" className="text-sm text-danger-text">
          {flow.error}
        </p>
      ) : null}

      <ExecuteButton
        label={simulated ? `${actionLabel} (simulated)` : actionLabel}
        disabledLabel={disabledLabel}
        loading={flow.creating}
        onClick={() => body && flow.start(body)}
      />
      {flow.dialog}
    </div>
  );
}
