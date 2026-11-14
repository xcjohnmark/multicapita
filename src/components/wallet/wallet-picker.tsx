"use client";

import { useAppKit } from "@reown/appkit/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2, QrCode, Wallet } from "lucide-react";
import { useConnection, useConnectors, type Connector } from "wagmi";
import { linkWithConnector, signInWithConnector } from "@/lib/wallet/actions";
import { reownProjectId } from "@/lib/wallet/config";
import { cn } from "@/lib/ui/cn";

/**
 * Wallet icons you click to connect. Installed browser wallets come from EIP-6963 discovery (each
 * announces its own name and icon). "All wallets" opens Reown AppKit: WalletConnect QR for mobile
 * wallets and the full directory. After connecting, the wallet signs one server challenge.
 */

type Mode = "signin" | "link";

const HIDDEN_IDS = new Set(["walletConnect", "injected", "ID_AUTH", "AUTH"]);

export function WalletPicker({
  mode,
  signedInAddress = null,
  onDone,
}: {
  mode: Mode;
  signedInAddress?: string | null;
  onDone: (address: string) => void;
}) {
  const connectors = useConnectors();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // EIP-6963 wallets carry an icon; the generic "Injected" connector is shown only when nothing
  // announced itself (an older wallet that only sets window.ethereum).
  const announced = connectors.filter((c) => c.icon && !HIDDEN_IDS.has(c.id));
  const fallback = announced.length === 0 ? connectors.filter((c) => c.id === "injected") : [];
  const wallets = dedupe([...announced, ...fallback]);

  const run = async (connector: Connector | undefined, key: string) => {
    setBusy(key);
    setError(null);
    const result = mode === "signin" ? await signInWithConnector(connector) : await linkWithConnector(connector, signedInAddress);
    setBusy(null);
    if (result.ok) onDone(result.value.address);
    else if (!result.rejected) setError(result.error);
  };

  return (
    <div className="space-y-4">
      <ul className="flex flex-wrap justify-center gap-2">
        {wallets.map((connector) => (
          <li key={connector.uid} className="w-[calc(50%-0.25rem)] sm:w-36">
            <WalletTile
              name={connector.name}
              icon={connector.icon}
              tag={connector.type === "injected" ? "Detected" : null}
              busy={busy === connector.uid}
              disabled={busy !== null}
              onClick={() => run(connector, connector.uid)}
            />
          </li>
        ))}
        {reownProjectId ? (
          <li className="w-[calc(50%-0.25rem)] sm:w-36">
            <AllWalletsTile busy={busy === "appkit"} disabled={busy !== null} onConnected={() => run(undefined, "appkit")} />
          </li>
        ) : null}
      </ul>

      {wallets.length === 0 && !reownProjectId ? (
        <p className="text-center text-sm text-pretty text-ink-muted">
          No browser wallet found. Install{" "}
          <a className="text-ink underline underline-offset-2" href="https://metamask.io/download/" target="_blank" rel="noreferrer">
            MetaMask
          </a>{" "}
          or{" "}
          <a className="text-ink underline underline-offset-2" href="https://rabby.io/" target="_blank" rel="noreferrer">
            Rabby
          </a>
          , then reload.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-center text-sm text-danger-text">
          {error}
        </p>
      ) : null}
      <p className="text-center text-sm text-ink-muted">
        {mode === "signin" ? "You'll sign one message. It never moves funds." : "Sign one message with the wallet you're adding."}
      </p>
    </div>
  );
}

function dedupe(list: Connector[]): Connector[] {
  const seen = new Set<string>();
  return list.filter((c) => {
    const key = c.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function WalletTile({
  name,
  icon,
  glyph,
  tag,
  busy,
  disabled,
  onClick,
}: {
  name: string;
  icon?: string;
  glyph?: ReactNode;
  tag: string | null;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-full flex-col items-center gap-2.5 rounded-[var(--radius-panel)] border border-line px-3 py-4 transition-[border-color,transform] duration-100 hover:border-line-strong active:scale-[0.98] disabled:opacity-60",
        busy && "border-ink-faint",
      )}
    >
      <span className="grid size-12 place-items-center">
        {busy ? (
          <Loader2 className="size-6 animate-spin text-ink-secondary" aria-hidden />
        ) : glyph ? (
          <span className="grid size-12 place-items-center rounded-[12px] bg-surface-raised">{glyph}</span>
        ) : icon ? (
          // eslint-disable-next-line @next/next/no-img-element -- wallet-provided data URI icon
          <img src={icon} alt="" className="size-12 rounded-[12px]" />
        ) : (
          <span className="grid size-12 place-items-center rounded-[12px] bg-surface-raised">
            <Wallet className="size-6 text-ink-secondary" strokeWidth={1.5} aria-hidden />
          </span>
        )}
      </span>
      <span className="max-w-full truncate text-[0.9375rem] text-ink">{name}</span>
      {tag ? <span className="-mt-1.5 text-xs text-accent-text">{tag}</span> : <span className="-mt-1.5 h-4" aria-hidden />}
    </button>
  );
}

/** Opens Reown AppKit and reports back once a wallet is connected through it. */
function AllWalletsTile({ busy, disabled, onConnected }: { busy: boolean; disabled: boolean; onConnected: () => void }) {
  const { open } = useAppKit();
  const connection = useConnection();
  const waiting = useRef(false);
  const startAddress = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!waiting.current) return;
    if (connection.status === "connected" && connection.address && connection.address !== startAddress.current) {
      waiting.current = false;
      onConnected();
    }
  }, [connection.status, connection.address, onConnected]);

  return (
    <WalletTile
      name="All wallets"
      tag={null}
      busy={busy}
      disabled={disabled}
      glyph={<QrCode className="size-6 text-ink-secondary" strokeWidth={1.5} aria-hidden />}
      onClick={() => {
        waiting.current = true;
        startAddress.current = connection.status === "connected" ? connection.address : undefined;
        void open({ view: "Connect" });
      }}
    />
  );
}
