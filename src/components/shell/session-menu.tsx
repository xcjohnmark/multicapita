"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, LogOut, Wallet } from "lucide-react";
import type { WalletBalances } from "@/lib/wallet/balances";
import type { ShellSession } from "@/lib/shell-state";
import "@/lib/wallet/provider";
import { signInWithWallet } from "@/lib/wallet/sign-in";
import { shortenMiddle } from "@/lib/format";
import { StatusDot } from "@/components/ui/primitives";

/**
 * Session menu and SIWE wallet connect.
 *
 * Uses a concise icon-first Wallet trigger (size-9 rounded-lg, lucide-react Wallet size-5)
 * matching the near.com/home platform design system.
 */

type SignInState = "idle" | "connecting";

export function SessionMenu({ session }: { session: ShellSession }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<SignInState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [balances, setBalances] = useState<WalletBalances | null>(null);
  const [loadingBalances, setLoadingBalances] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const loadBalances = useCallback(async (address: string) => {
    setLoadingBalances(true);
    try {
      const response = await fetch(`/api/wallet/balances?address=${address}`);
      const body = (await response.json()) as {
        data?: WalletBalances;
        error?: { message: string };
      };
      if (!response.ok || !body.data) {
        setError(body.error?.message ?? "Balance read failed.");
        return;
      }
      setBalances(body.data);
    } catch {
      setError("Could not reach the balance endpoint.");
    } finally {
      setLoadingBalances(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const toggleMenu = useCallback(() => {
    const next = !open;
    setOpen(next);
    if (next && session.authenticated && session.address && !balances && !loadingBalances) {
      void loadBalances(session.address);
    }
  }, [balances, loadBalances, loadingBalances, open, session.address, session.authenticated]);

  const signIn = useCallback(async () => {
    setError(null);
    setState("connecting");
    const result = await signInWithWallet();
    setState("idle");
    if (!result.ok) {
      setError(result.error);
      setOpen(true);
      return;
    }
    setOpen(false);
    router.refresh();
  }, [router]);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setBalances(null);
    setOpen(false);
    router.refresh();
  }, [router]);

  const busy = state !== "idle";
  const shortAddr = session.address ? shortenMiddle(session.address, 6, 4) : null;
  const triggerLabel = session.authenticated
    ? `Wallet (${shortAddr})`
    : session.demo
      ? "Demo wallet session"
      : "Connect wallet";

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => (session.authenticated || session.demo || error ? toggleMenu() : signIn())}
        disabled={busy}
        data-loading={busy ? "true" : undefined}
        aria-expanded={open}
        aria-label={triggerLabel}
        title={triggerLabel}
        className={`btn btn-icon ${
          session.authenticated ? "btn-secondary" : "btn-highlight"
        } [&_svg:not([class*='size-'])]:size-5`}
      >
        {busy ? (
          <Loader2 className="size-5 animate-spin" strokeWidth={1.5} aria-hidden />
        ) : (
          <Wallet className="size-5" strokeWidth={1.5} aria-hidden />
        )}
        {session.authenticated ? (
          <span
            className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-accent ring-2 ring-canvas"
            aria-hidden
          />
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-30 mt-2 w-80 rounded-xl border border-line bg-canvas shadow-[0_4px_16px_rgba(17,24,39,0.08)]">
          <div className="flex items-center justify-between border-b border-line px-3.5 py-2.5">
            <div className="flex items-center gap-1.5">
              <StatusDot tone={session.authenticated ? "ok" : "warn"} />
              <p className="eyebrow">{session.authenticated ? "Wallet session" : "Demo session"}</p>
            </div>
            {session.authenticated ? (
              <button
                type="button"
                onClick={signOut}
                className="btn btn-ghost h-7 px-2 text-xs text-ink-muted"
              >
                <LogOut className="size-3.5" strokeWidth={1.5} aria-hidden />
                <span>Sign out</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={signIn}
                disabled={busy}
                data-loading={busy ? "true" : undefined}
                className="btn btn-highlight h-7 px-2.5 text-xs"
              >
                Connect
              </button>
            )}
          </div>

          {error ? (
            <p className="border-b border-line bg-red-50/60 px-3.5 py-2 text-xs text-danger-text">
              {error}
            </p>
          ) : null}

          {session.authenticated && session.address ? (
            <div className="space-y-3 px-3.5 py-3">
              <p className="rounded-lg border border-line bg-surface px-2.5 py-1.5 font-mono text-[11px] break-all text-ink-secondary">
                {session.address}
              </p>

              {loadingBalances && !balances ? (
                <p className="text-xs text-ink-muted">Reading Base and Arbitrum…</p>
              ) : null}

              {balances?.chains.map((chain) => (
                <div key={chain.chainId} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-ink">{chain.chainName}</p>
                    <span className="text-[11px] text-ink-faint">
                      {chain.blockNumber ? `block ${chain.blockNumber}` : "no block"}
                    </span>
                  </div>

                  {chain.error ? (
                    <p className="rounded-lg border border-amber-200 bg-amber-50/70 px-2.5 py-1.5 text-[11px] text-amber-800">
                      RPC read failed: {chain.error}
                    </p>
                  ) : (
                    <ul className="space-y-0.5">
                      {chain.tokens.map((token) => (
                        <li key={token.address} className="flex items-center justify-between text-xs">
                          <span className="text-ink-muted">{token.symbol}</span>
                          <span className="metric text-ink" data-numeric>
                            {token.amountDisplay}
                          </span>
                        </li>
                      ))}
                      {chain.native ? (
                        <li className="flex items-center justify-between text-xs">
                          <span className="text-ink-muted">{chain.native.symbol} (gas)</span>
                          <span className="metric text-ink-secondary" data-numeric>
                            {chain.native.amountDisplay}
                          </span>
                        </li>
                      ) : null}
                    </ul>
                  )}
                </div>
              ))}

              <p className="border-t border-line pt-2.5 text-[11px] leading-relaxed text-ink-faint">
                Read directly from public RPC. No USD value is attached when no verified price
                source is used. Signing out revokes this session.
              </p>
            </div>
          ) : (
            <p className="px-3.5 py-3 text-xs leading-relaxed text-ink-muted">
              A demo session has no wallet. Connect an EVM wallet to read live balances, hold a
              real portfolio, and use the execution console.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
