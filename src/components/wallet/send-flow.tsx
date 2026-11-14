"use client";

import { useMemo, useState } from "react";
import { isAddress } from "viem";
import { ExecuteButton, ChecksSummary, PreviewRows, previewOf, useExecuteFlow, usePlanPreview } from "@/components/execution/plan-client";
import { AmountInput } from "@/components/ui/amount-input";
import { SelectMenu } from "@/components/ui/select-menu";
import { TokenOnChain } from "@/components/ui/token-stack";
import { parseDecimalToAtomic } from "@/lib/finance/amounts";
import { formatUsd } from "@/lib/format";
import type { TokenOption, WalletTokens } from "@/lib/platform-tokens";
import { WalletSwitch } from "./wallet-switch";
import { displayAmount, inputAmount, shareInput } from "@/lib/ui/amount";

/**
 * near.com Send: token → network → recipient → amount → Review. Same network is a plain transfer;
 * another network routes through a 1Click leg delivered to the recipient.
 */
export function SendFlow({
  tokens: aggregate,
  simulated,
  wallets = null,
}: {
  tokens: TokenOption[];
  simulated: boolean;
  wallets?: WalletTokens[] | null;
}) {
  const [walletAddress, setWalletAddress] = useState<string | null>(wallets?.[0]?.address ?? null);
  const tokens = wallets?.find((w) => w.address === walletAddress)?.tokens ?? aggregate;
  const held = tokens.filter((t) => BigInt(t.amountAtomic) > 0n);
  const choices = held.length ? held : tokens;
  const [tokenKey, setTokenKey] = useState<string | null>(choices[0]?.key ?? null);
  const token = tokens.find((t) => t.key === tokenKey) ?? null;
  const destinations = token ? tokens.filter((t) => t.symbol === token.symbol) : [];
  const [toChain, setToChain] = useState<string | null>(token ? String(token.chainId) : null);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");

  const atomic = useMemo(() => {
    if (!token || !amount) return null;
    try {
      return parseDecimalToAtomic(amount, token.decimals);
    } catch {
      return null;
    }
  }, [amount, token]);

  const recipientValid = isAddress(recipient, { strict: false });
  const over = token && atomic !== null ? atomic > BigInt(token.amountAtomic) : false;
  const body =
    token && toChain && recipientValid && atomic && atomic > 0n
      ? {
          kind: "send",
          token: { chainId: token.chainId, address: token.address },
          toChainId: Number(toChain),
          recipient,
          amount,
          slippageBps: 50,
          ...(walletAddress ? { walletAddress } : {}),
        }
      : null;
  const state = usePlanPreview(body);
  const preview = previewOf(state);
  const flow = useExecuteFlow();

  const disabled = !token
    ? "Select a token"
    : !recipient
      ? "Enter a recipient"
      : !recipientValid
        ? "Recipient isn't a valid address"
        : !atomic || atomic <= 0n
          ? "Enter an amount"
          : over
            ? `Not enough ${token.symbol}`
            : preview && !preview.ok
              ? "Blocked by guardrails"
              : !preview
                ? "Checking…"
                : null;

  return (
    <div className="space-y-3">
      {wallets && wallets.length > 1 && walletAddress ? (
        <WalletSwitch wallets={wallets} value={walletAddress} onChange={(address) => { setWalletAddress(address); setAmount(""); }} />
      ) : null}
      <SelectMenu
        variant="picker"
        label="Token"
        ariaLabel="Token"
        value={tokenKey}
        onValueChange={(value) => {
          const next = tokens.find((t) => t.key === value);
          setTokenKey(value);
          setToChain(next ? String(next.chainId) : null);
          setAmount("");
        }}
        options={choices.map((t) => ({
          value: t.key,
          label: `${t.symbol} on ${t.chainName}`,
          icon: <TokenOnChain symbol={t.symbol} chainId={t.chainId} size="lg" />,
          meta: displayAmount(t.amountAtomic, t.decimals, 4),
        }))}
      />
      <SelectMenu
        variant="picker"
        label="Deliver on"
        ariaLabel="Destination network"
        value={toChain}
        onValueChange={setToChain}
        options={destinations.map((t) => ({
          value: String(t.chainId),
          label: t.chainId === token?.chainId ? `${t.chainName} (same network)` : `${t.chainName} via 1Click`,
          icon: <TokenOnChain symbol={t.symbol} chainId={t.chainId} size="lg" />,
        }))}
      />
      <label className="picker-row min-h-0 cursor-text flex-col items-stretch gap-1">
        <span className="text-sm text-ink-muted">Recipient</span>
        <input
          value={recipient}
          onChange={(event) => setRecipient(event.target.value.trim())}
          placeholder="0x…"
          spellCheck={false}
          autoComplete="off"
          aria-invalid={recipient !== "" && !recipientValid}
          className="w-full bg-transparent font-mono text-[0.9375rem] text-ink outline-none placeholder:text-ink-faint"
        />
      </label>

      <AmountInput
        className="mt-3"
        value={amount}
        onChange={setAmount}
        symbol={token?.symbol ?? ""}
        decimals={token?.decimals ?? 6}
        usdHint={token?.priceUsd && amount ? formatUsd(Number(amount) * token.priceUsd) : "$0.00"}
        invalid={over}
        balanceLabel={token ? `Balance ${displayAmount(token.amountAtomic, token.decimals, 4)} ${token.symbol}` : null}
        shortcuts={token ? [{ label: "50%", onSelect: () => setAmount(shareInput(token.amountAtomic, token.decimals, 5000)) }] : undefined}
        onMax={token ? () => setAmount(inputAmount(token.amountAtomic, token.decimals)) : undefined}
      />

      {body ? (
        <div className="space-y-3 pt-2">
          <PreviewRows state={state} />
          {preview ? <ChecksSummary checks={preview.checks} /> : null}
        </div>
      ) : null}

      {flow.error ? (
        <p role="alert" className="text-sm text-danger-text">
          {flow.error}
        </p>
      ) : null}
      <div className="pt-2">
        <ExecuteButton label={simulated ? "Review send (simulated)" : "Review send"} disabledLabel={disabled} loading={flow.creating} onClick={() => body && flow.start(body)} />
      </div>
      {flow.dialog}
    </div>
  );
}
