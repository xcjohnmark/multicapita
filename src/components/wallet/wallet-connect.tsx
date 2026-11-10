"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WalletBalances } from "@/lib/wallet/balances";
import { shortenMiddle } from "@/lib/format";
import { StatusDot } from "@/components/ui/primitives";

/**
 * Minimal injected-wallet connector.
 *
 * No WalletConnect project id, no SDK: the browser already exposes an EIP-1193 provider, and all
 * this needs is an address. Truthfulness rules that shape the UI:
 *  - a chain whose RPC failed shows its error, not a zero balance;
 *  - balances carry their block number and observation time;
 *  - no USD value is invented for a token without a verified price source.
 */

type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

const USER_REJECTED = 4001;

export function WalletConnect() {
  const [address, setAddress] = useState<string | null>(null);
  const [balances, setBalances] = useState<WalletBalances | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [loadingBalances, setLoadingBalances] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const loadBalances = useCallback(async (account: string) => {
    setLoadingBalances(true);
    setError(null);
    try {
      const response = await fetch(`/api/wallet/balances?address=${account}`);
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

  const connect = useCallback(async () => {
    const provider = window.ethereum;
    if (!provider) {
      setError("No injected wallet found. Install a browser wallet extension to read live balances.");
      setOpen(true);
      return;
    }

    setConnecting(true);
    setError(null);
    try {
      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
      const account = accounts[0];
      if (!account) {
        setError("The wallet returned no account.");
        return;
      }
      setAddress(account);
      setOpen(true);
      await loadBalances(account);
    } catch (cause) {
      const code = (cause as { code?: number } | undefined)?.code;
      setError(
        code === USER_REJECTED
          ? "Connection request was rejected in the wallet."
          : "The wallet refused the connection request.",
      );
    } finally {
      setConnecting(false);
    }
  }, [loadBalances]);

  const disconnect = useCallback(() => {
    setAddress(null);
    setBalances(null);
    setError(null);
    setOpen(false);
  }, []);

  // Silent reconnect: eth_accounts does not prompt, so a returning visitor is not asked twice.
  useEffect(() => {
    const provider = window.ethereum;
    if (!provider) return;

    let cancelled = false;
    provider
      .request({ method: "eth_accounts" })
      .then((accounts) => {
        const account = (accounts as string[])[0];
        if (!cancelled && account) {
          setAddress(account);
          void loadBalances(account);
        }
      })
      .catch(() => {
        /* no wallet session; the button stays in its idle state */
      });

    const onAccountsChanged = (...args: unknown[]) => {
      const accounts = (args[0] as string[]) ?? [];
      const account = accounts[0];
      if (account) {
        setAddress(account);
        void loadBalances(account);
      } else {
        disconnect();
      }
    };

    provider.on?.("accountsChanged", onAccountsChanged);
    return () => {
      cancelled = true;
      provider.removeListener?.("accountsChanged", onAccountsChanged);
    };
  }, [disconnect, loadBalances]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      {address ? (
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="chip border-accent/30 text-ink"
        >
          <StatusDot tone="ok" />
          {shortenMiddle(address, 6, 4)}
        </button>
      ) : (
        <button
          type="button"
          onClick={connect}
          disabled={connecting}
          className="btn h-9 px-3 text-sm"
        >
          {connecting ? "Connecting…" : "Connect wallet"}
        </button>
      )}

      {open ? (
        <div className="absolute right-0 top-full z-30 mt-2 w-80 rounded-panel border border-line bg-surface-raised shadow-lg">
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <p className="eyebrow">Live balances</p>
            {address ? (
              <button
                type="button"
                onClick={disconnect}
                className="text-[11px] text-ink-faint underline-offset-2 hover:underline"
              >
                Disconnect
              </button>
            ) : null}
          </div>

          {error ? (
            <p className="px-3 py-3 text-xs text-ink-muted">{error}</p>
          ) : null}

          {address ? (
            <div className="space-y-3 px-3 py-3">
              <p className="font-mono text-[11px] break-all text-ink-muted">{address}</p>

              {loadingBalances && !balances ? (
                <p className="text-xs text-ink-faint">Reading Base and Arbitrum…</p>
              ) : null}

              {balances?.chains.map((chain) => (
                <div key={chain.chainId} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-ink">{chain.chainName}</p>
                    <span className="text-[10px] text-ink-faint">
                      {chain.blockNumber ? `block ${chain.blockNumber}` : "no block"}
                    </span>
                  </div>

                  {chain.error ? (
                    <p className="rounded-md border border-warn/30 bg-warn/[0.06] px-2 py-1.5 text-[11px] text-ink-muted">
                      RPC read failed: {chain.error}
                    </p>
                  ) : (
                    <ul className="space-y-0.5">
                      {chain.tokens.map((token) => (
                        <li
                          key={token.address}
                          className="flex items-center justify-between text-[11px]"
                        >
                          <span className="text-ink-faint">{token.symbol}</span>
                          <span className="metric text-ink" data-numeric>
                            {token.amountDisplay}
                          </span>
                        </li>
                      ))}
                      {chain.native ? (
                        <li className="flex items-center justify-between text-[11px]">
                          <span className="text-ink-faint">{chain.native.symbol} (gas)</span>
                          <span className="metric text-ink-muted" data-numeric>
                            {chain.native.amountDisplay}
                          </span>
                        </li>
                      ) : null}
                    </ul>
                  )}
                </div>
              ))}

              <p className="border-t border-line pt-2 text-[10px] leading-relaxed text-ink-faint">
                Read directly from public RPC. No USD value is attached: no verified price source
                was used for this request. Read-only — this app never asks for a signature here.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
