"use client";

import { useState } from "react";
import { Loader2, Plus, Trash2, Wallet as WalletIcon } from "lucide-react";
import { ChainBadge, Panel, PanelHeader } from "@/components/ui/primitives";
import { shortenMiddle } from "@/lib/format";

export type LinkedWalletItem = {
  id: string;
  address: string;
  chainFamily: string;
  chainId: number;
  label: string | null;
  ownershipVerifiedAt: string | null;
};

export function LinkedWalletsPanel({ initialWallets }: { initialWallets: LinkedWalletItem[] }) {
  const [wallets, setWallets] = useState<LinkedWalletItem[]>(initialWallets);
  const [address, setAddress] = useState("");
  const [chainFamily, setChainFamily] = useState<"evm" | "near" | "solana">("evm");
  const [chainId, setChainId] = useState(8453);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addWallet(e: React.FormEvent) {
    e.preventDefault();
    if (!address.trim()) return;
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/wallet/linked", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          address: address.trim(),
          chainFamily,
          chainId: chainFamily === "evm" ? chainId : 0,
          label: label.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error?.message ?? "Could not import wallet.");
        return;
      }
      const added = json.data.wallet as LinkedWalletItem;
      setWallets((prev) => [
        ...prev.filter((w) => w.id !== added.id),
        added,
      ]);
      setAddress("");
      setLabel("");
    } catch {
      setError("Network error linking wallet.");
    } finally {
      setBusy(false);
    }
  }

  async function removeWallet(walletId: string) {
    setError(null);
    const res = await fetch("/api/wallet/linked", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ walletId }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error?.message ?? "Failed to remove wallet.");
      return;
    }
    setWallets((prev) => prev.filter((w) => w.id !== walletId));
  }

  return (
    <Panel>
      <PanelHeader
        eyebrow="Multi-Wallet Control"
        title="Connected & Imported Wallets"
        meta={<span className="text-xs text-ink-muted">{wallets.length} linked</span>}
      />
      <div className="divide-y divide-line">
        {wallets.map((w) => (
          <div key={w.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-xs">
            <div className="flex items-center gap-2.5">
              <WalletIcon className="size-4 text-ink-muted" />
              <div>
                <p className="font-medium text-ink">
                  {w.label ?? `${w.chainFamily.toUpperCase()} Wallet`}{" "}
                  <span className="font-mono text-ink-secondary">
                    ({w.chainFamily === "near" ? w.address : shortenMiddle(w.address, 6, 4)})
                  </span>
                </p>
                <p className="text-xs text-ink-muted">
                  {w.ownershipVerifiedAt ? "SIWE Verified Signer" : "Imported Watch/Source Wallet"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {w.chainFamily === "evm" ? (
                <ChainBadge chainId={w.chainId} />
              ) : (
                <span className="chip uppercase text-xs">{w.chainFamily}</span>
              )}
              {!w.ownershipVerifiedAt ? (
                <button
                  type="button"
                  onClick={() => removeWallet(w.id)}
                  className="btn btn-secondary h-7 px-2 text-danger-text"
                  title="Remove imported wallet"
                >
                  <Trash2 className="size-3.5" />
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      <form
        onSubmit={addWallet}
        className="flex flex-col gap-2.5 border-t border-line bg-surface px-5 py-4 sm:flex-row sm:items-center"
      >
        <select
          value={chainFamily}
          onChange={(e) => setChainFamily(e.target.value as "evm" | "near" | "solana")}
          className="h-9 rounded-lg border border-line bg-canvas px-2.5 text-xs text-ink"
        >
          <option value="evm">EVM (0x)</option>
          <option value="near">NEAR (.near)</option>
          <option value="solana">Solana</option>
        </select>

        {chainFamily === "evm" ? (
          <select
            value={chainId}
            onChange={(e) => setChainId(Number(e.target.value))}
            className="h-9 rounded-lg border border-line bg-canvas px-2.5 text-xs text-ink"
          >
            <option value={8453}>Base (8453)</option>
            <option value={42161}>Arbitrum (42161)</option>
            <option value={1}>Ethereum (1)</option>
          </select>
        ) : null}

        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder={
            chainFamily === "near"
              ? "alice.near"
              : chainFamily === "solana"
                ? "Solana pubkey"
                : "0x... secondary wallet"
          }
          className="h-9 flex-1 rounded-lg border border-line bg-canvas px-3 font-mono text-xs text-ink"
        />
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label (optional)"
          className="h-9 w-36 rounded-lg border border-line bg-canvas px-3 text-xs text-ink"
        />
        <button
          type="submit"
          disabled={busy || !address.trim()}
          className="btn btn-secondary h-9 px-3 text-xs"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          <span>Import Wallet</span>
        </button>
      </form>
      {error ? <p className="px-5 pb-3 text-xs text-danger-text">{error}</p> : null}
    </Panel>
  );
}
