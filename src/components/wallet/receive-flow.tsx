"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Check, Copy, Info, Wallet } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { SelectMenu } from "@/components/ui/select-menu";
import { AssetIcon } from "@/components/ui/asset-icon";
import { TokenOnChain } from "@/components/ui/token-stack";
import type { TokenOption } from "@/lib/platform-tokens";

/** near.com Receive: pick a token, pick a network, then the address with a QR code. */
export function ReceiveFlow({ tokens, address, qrSvg }: { tokens: TokenOption[]; address: string | null; qrSvg: string | null }) {
  const symbols = useMemo(() => [...new Set(tokens.map((t) => t.symbol))], [tokens]);
  const [symbol, setSymbol] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const networks = tokens.filter((t) => t.symbol === symbol);
  const picked = networks.find((t) => String(t.chainId) === chainId) ?? null;

  if (!address) {
    return (
      <div className="card-tile items-center px-6 py-14 text-center">
        <span className="grid size-14 place-items-center rounded-full bg-surface-raised">
          <Wallet className="size-6 text-ink-secondary" strokeWidth={1.5} aria-hidden />
        </span>
        <p className="type-h6 mt-5 text-ink">Connect a wallet to receive</p>
        <p className="mt-1.5 max-w-sm text-sm text-pretty text-ink-muted">The demo account has no address of its own. Your wallet address appears here once you sign in.</p>
        <Link href="/signin" className={buttonClass("primary", "lg", "mt-6")}>
          Connect wallet
        </Link>
      </div>
    );
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="space-y-3">
      <SelectMenu
        variant="picker"
        label="Token"
        placeholder="Select token"
        ariaLabel="Token"
        value={symbol}
        onValueChange={(value) => {
          setSymbol(value);
          setChainId(null);
        }}
        options={symbols.map((s) => ({ value: s, label: s, icon: <AssetIcon symbolOrName={s} size="lg" /> }))}
      />
      <SelectMenu
        variant="picker"
        label="Network"
        placeholder="Select network"
        ariaLabel="Network"
        value={chainId}
        onValueChange={setChainId}
        options={networks.map((t) => ({ value: String(t.chainId), label: t.chainName, icon: <TokenOnChain symbol={t.symbol} chainId={t.chainId} size="lg" /> }))}
      />

      {picked ? (
        <div className="card-tile mt-6 items-center p-6 text-center">
          {qrSvg ? (
            <div
              className="size-48 rounded-[var(--radius-media)] border border-line bg-canvas p-2 [&_svg]:size-full"
              role="img"
              aria-label="QR code of your wallet address"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
          ) : null}
          <p className="mt-5 text-sm text-ink-muted">Your {picked.chainName} address</p>
          <p className="mt-1 font-mono text-[0.9375rem] break-all text-ink">{address}</p>
          <button type="button" onClick={copy} className={buttonClass("secondary", "lg", "mt-5 w-full")}>
            {copied ? <Check className="size-4" strokeWidth={1.75} aria-hidden /> : <Copy className="size-4" strokeWidth={1.5} aria-hidden />}
            {copied ? "Copied" : "Copy address"}
          </button>
          <p className="mt-4 flex items-start gap-2 text-left text-sm text-pretty text-warn-text">
            <Info className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} aria-hidden />
            Only send {picked.symbol} on {picked.chainName} to this address. Other networks may lose funds.
          </p>
        </div>
      ) : (
        <p className="pt-2 text-center text-sm text-ink-muted">Pick a token and a network to see your address.</p>
      )}
    </div>
  );
}
