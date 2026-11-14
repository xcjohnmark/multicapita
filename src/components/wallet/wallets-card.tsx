"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { isAddress } from "viem";
import { Check, Copy, Eye, Loader2, Plus, Trash2 } from "lucide-react";
import { ConfirmDialog, Modal } from "@/components/ui/dialog";
import { Identicon } from "@/components/ui/identicon";
import { Tag } from "@/components/ui/tag";
import { ChainIcon } from "@/components/ui/token-stack";
import { shortenMiddle } from "@/lib/format";
import type { AccountWallet } from "@/lib/wallet/accounts";
import { WalletPicker } from "./wallet-picker";

/**
 * All wallets on the account, one row per address. "Add wallet" proves ownership with a
 * signature (that wallet can then fund and sign plans); "Watch" adds balances only.
 */
export function WalletsCard({ wallets, signedInAddress }: { wallets: AccountWallet[]; signedInAddress: string | null }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"link" | "watch" | null>(null);
  const [removing, setRemoving] = useState<AccountWallet | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    setError(null);
    const response = await fetch("/api/wallet/linked", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address: removing.address }),
    });
    setBusy(false);
    if (!response.ok) {
      const json = (await response.json()) as { error?: { message: string } };
      setError(json.error?.message ?? "Couldn't remove it.");
      return;
    }
    setRemoving(null);
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-line rounded-[var(--radius-panel)] border border-line">
        {wallets.map((wallet) => (
          <WalletRow key={wallet.address} wallet={wallet} onRemove={wallet.role === "signed_in" ? null : () => setRemoving(wallet)} />
        ))}
        {wallets.length === 0 ? <li className="px-4 py-6 text-center text-sm text-ink-muted">No wallets yet.</li> : null}
      </ul>

      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setDialog("link")} className="btn btn-primary h-12">
          <Plus className="size-4" strokeWidth={1.75} aria-hidden />
          Add wallet
        </button>
        <button type="button" onClick={() => setDialog("watch")} className="btn btn-secondary h-12">
          <Eye className="size-4" strokeWidth={1.5} aria-hidden />
          Watch address
        </button>
      </div>

      <Modal open={dialog === "link"} onOpenChange={(open) => !open && setDialog(null)} title="Add a wallet" description="Switch to the wallet you want to add, then pick it.">
        {dialog === "link" ? (
          <WalletPicker
            mode="link"
            signedInAddress={signedInAddress}
            onDone={() => {
              setDialog(null);
              router.refresh();
            }}
          />
        ) : null}
      </Modal>

      <Modal open={dialog === "watch"} onOpenChange={(open) => !open && setDialog(null)} title="Watch an address" description="See its balances. You can't sign for it.">
        {dialog === "watch" ? (
          <WatchForm
            onDone={() => {
              setDialog(null);
              router.refresh();
            }}
          />
        ) : null}
      </Modal>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Remove this wallet?"
        description={removing ? `${shortenMiddle(removing.address, 6, 4)} leaves this account. Nothing on-chain changes.` : undefined}
        confirmLabel="Remove"
        onConfirm={remove}
        confirming={busy}
        error={error}
      />
    </div>
  );
}

function WalletRow({ wallet, onRemove }: { wallet: AccountWallet; onRemove: (() => void) | null }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(wallet.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };
  return (
    <li className="flex items-center gap-3 px-4 py-3.5">
      <Identicon seed={wallet.address} size={40} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-mono text-[0.9375rem] text-ink">{shortenMiddle(wallet.address, 6, 4)}</span>
          <button type="button" onClick={copy} className="grid size-7 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-surface-raised hover:text-ink" aria-label="Copy address">
            {copied ? <Check className="size-3.5" strokeWidth={2} /> : <Copy className="size-3.5" strokeWidth={1.5} />}
          </button>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {wallet.role === "signed_in" ? <Tag tone="dark">Signed in</Tag> : wallet.role === "owned" ? <Tag tone="positive">Can sign</Tag> : <Tag>Watch only</Tag>}
          <span className="flex items-center gap-1" aria-label={`Networks: ${wallet.chainIds.length}`}>
            {wallet.chainIds.map((id) => (
              <ChainIcon key={id} chainId={id} />
            ))}
          </span>
        </div>
      </div>
      {onRemove ? (
        <button type="button" onClick={onRemove} className="grid size-9 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-surface-raised hover:text-danger-text" aria-label="Remove wallet">
          <Trash2 className="size-4" strokeWidth={1.5} />
        </button>
      ) : null}
    </li>
  );
}

function WatchForm({ onDone }: { onDone: () => void }) {
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = isAddress(address.trim(), { strict: false });

  const submit = async () => {
    setBusy(true);
    setError(null);
    const response = await fetch("/api/wallet/linked", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address: address.trim() }),
    });
    setBusy(false);
    if (!response.ok) {
      const json = (await response.json()) as { error?: { message: string } };
      setError(json.error?.message ?? "Couldn't add it.");
      return;
    }
    onDone();
  };

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) void submit();
      }}
    >
      <label className="field h-12">
        <input
          autoFocus
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          placeholder="0x…"
          spellCheck={false}
          autoComplete="off"
          aria-label="Wallet address"
          className="font-mono"
        />
      </label>
      {error ? (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={!valid || busy} className="btn btn-primary h-12 w-full">
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        {address && !valid ? "Not a valid address" : "Watch"}
      </button>
    </form>
  );
}
