"use client";

import { useMemo, useState } from "react";
import { ArrowDownUp } from "lucide-react";
import { ChecksSummary, ExecuteButton, PreviewRows, previewOf, useExecuteFlow, usePlanPreview } from "@/components/execution/plan-client";
import { SelectMenu } from "@/components/ui/select-menu";
import { TokenOnChain } from "@/components/ui/token-stack";
import { sanitizeAmount } from "@/components/ui/amount-input";
import { parseDecimalToAtomic } from "@/lib/finance/amounts";
import { formatUsd } from "@/lib/format";
import type { TokenOption, WalletTokens } from "@/lib/platform-tokens";
import { WalletSwitch } from "./wallet-switch";
import { displayAmount, inputAmount } from "@/lib/ui/amount";

/**
 * Swap: Sell and Buy cards with a flip button. Any tracked token on Base or Arbitrum, same or
 * cross-network; the Buy figure is the 1Click dry quote's output, filled in as you type.
 */
export function SwapFlow({
  tokens: aggregate,
  simulated,
  initialFrom,
  initialTo,
  wallets = null,
}: {
  tokens: TokenOption[];
  simulated: boolean;
  initialFrom?: string;
  initialTo?: string;
  wallets?: WalletTokens[] | null;
}) {
  const [walletAddress, setWalletAddress] = useState<string | null>(wallets?.[0]?.address ?? null);
  const tokens = wallets?.find((w) => w.address === walletAddress)?.tokens ?? aggregate;
  const held = tokens.filter((t) => BigInt(t.amountAtomic) > 0n);
  const [fromKey, setFromKey] = useState<string | null>(initialFrom ?? held[0]?.key ?? tokens[0]?.key ?? null);
  // Default Buy: native ETH on the other network (1Click quotes native ETH; WETH often has no route).
  const [toKey, setToKey] = useState<string | null>(() => {
    if (initialTo) return initialTo;
    const fromChain = tokens.find((t) => t.key === fromKey)?.chainId;
    return (tokens.find((t) => t.symbol === "ETH" && t.chainId !== fromChain) ?? tokens.find((t) => t.key !== fromKey))?.key ?? null;
  });
  const [amount, setAmount] = useState("");
  const from = tokens.find((t) => t.key === fromKey) ?? null;
  const to = tokens.find((t) => t.key === toKey) ?? null;

  const atomic = useMemo(() => {
    if (!from || !amount) return null;
    try {
      return parseDecimalToAtomic(amount, from.decimals);
    } catch {
      return null;
    }
  }, [amount, from]);
  const over = from && atomic !== null ? atomic > BigInt(from.amountAtomic) : false;
  const same = from && to && from.key === to.key;
  const body =
    from && to && !same && atomic && atomic > 0n
      ? {
          kind: "swap",
          from: { chainId: from.chainId, address: from.address },
          to: { chainId: to.chainId, address: to.address },
          amount,
          slippageBps: 50,
          ...(walletAddress ? { walletAddress } : {}),
        }
      : null;
  const state = usePlanPreview(body);
  const preview = previewOf(state);
  const flow = useExecuteFlow();

  const options = (exclude: string | null) =>
    tokens
      .filter((t) => t.key !== exclude)
      .map((t) => ({
        value: t.key,
        label: `${t.symbol} · ${t.chainName}`,
        icon: <TokenOnChain symbol={t.symbol} chainId={t.chainId} />,
        meta: BigInt(t.amountAtomic) > 0n ? displayAmount(t.amountAtomic, t.decimals, 4) : undefined,
      }));

  const disabled = !from || !to
    ? "Select tokens"
    : same
      ? "Pick two different tokens"
      : !atomic || atomic <= 0n
        ? "Enter an amount"
        : over
          ? `Not enough ${from.symbol}`
          : !preview
            ? "Getting quote…"
            : !preview.ok
              ? preview.routeError ? "No route" : "Blocked by guardrails"
              : null;

  return (
    <div className="space-y-2">
      {wallets && wallets.length > 1 && walletAddress ? (
        <WalletSwitch wallets={wallets} value={walletAddress} onChange={(address) => { setWalletAddress(address); setAmount(""); }} />
      ) : null}
      <div className="relative space-y-2">
        <section className="rounded-[var(--radius-panel)] border border-line p-5" aria-label="Sell">
          <div className="flex items-center justify-between text-sm text-ink-muted">
            <span>Sell</span>
            {from ? (
              <button type="button" className="tabular-nums hover:text-ink" onClick={() => setAmount(inputAmount(from.amountAtomic, from.decimals))}>
                Balance {displayAmount(from.amountAtomic, from.decimals, 4)} · Max
              </button>
            ) : null}
          </div>
          <div className="mt-3 flex items-center gap-3">
            <input
              inputMode="decimal"
              autoComplete="off"
              placeholder="0"
              value={amount}
              aria-label={`Amount of ${from?.symbol ?? "token"} to sell`}
              aria-invalid={over || undefined}
              onChange={(event) => {
                const next = sanitizeAmount(event.target.value, from?.decimals ?? 18);
                if (next !== null) setAmount(next);
              }}
              className={`figure min-w-0 flex-1 bg-transparent text-4xl text-ink outline-none placeholder:text-ink-faint ${over ? "text-danger-text" : ""}`}
            />
            <SelectMenu ariaLabel="Sell token" className="h-12 w-auto shrink-0 rounded-full" value={fromKey} onValueChange={(v) => { setFromKey(v); setAmount(""); }} options={options(null)} />
          </div>
          <p className="mt-2 text-sm text-ink-muted tabular-nums">{from?.priceUsd && amount ? formatUsd(Number(amount) * from.priceUsd) : "$0.00"}</p>
        </section>

        <button
          type="button"
          onClick={() => {
            setFromKey(toKey);
            setToKey(fromKey);
            setAmount("");
          }}
          className="absolute top-1/2 left-1/2 z-[1] grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-4 border-canvas bg-surface-raised text-ink transition-transform duration-150 hover:bg-line-faint active:scale-95"
          aria-label="Flip sell and buy"
        >
          <ArrowDownUp className="size-5" strokeWidth={1.5} />
        </button>

        <section className="rounded-[var(--radius-panel)] bg-surface p-5" aria-label="Buy">
          <div className="text-sm text-ink-muted">Buy</div>
          <div className="mt-3 flex items-center gap-3">
            <p className={`figure min-w-0 flex-1 truncate text-4xl ${preview?.receive ? "text-ink" : "text-ink-faint"}`} aria-live="polite">
              {preview?.receive ? displayAmount(preview.receive.atomic, preview.receive.decimals, 6) : "0"}
            </p>
            <SelectMenu ariaLabel="Buy token" className="h-12 w-auto shrink-0 rounded-full bg-canvas" value={toKey} onValueChange={setToKey} options={options(fromKey)} />
          </div>
          <p className="mt-2 text-sm text-ink-muted tabular-nums">{preview?.receive?.usd != null ? formatUsd(preview.receive.usd) : "$0.00"}</p>
        </section>
      </div>

      {body ? (
        <div className="space-y-3 pt-3">
          <PreviewRows state={state} />
          {preview ? <ChecksSummary checks={preview.checks} /> : null}
        </div>
      ) : null}
      {flow.error ? (
        <p role="alert" className="text-sm text-danger-text">
          {flow.error}
        </p>
      ) : null}
      <div className="pt-3">
        <ExecuteButton label={simulated ? "Review swap (simulated)" : "Review swap"} disabledLabel={disabled} loading={flow.creating} onClick={() => body && flow.start(body)} />
      </div>
      {flow.dialog}
    </div>
  );
}
