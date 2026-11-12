"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { ArrowRight, Loader2, ShieldCheck, Wallet } from "lucide-react";
import { Panel } from "@/components/ui/primitives";
import { signInWithWallet } from "@/lib/wallet/sign-in";

export default function SignInPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const result = await signInWithWallet();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push("/app");
      router.refresh();
    } catch {
      setError("An unexpected error occurred during sign-in.");
    } finally {
      setBusy(false);
    }
  }, [router]);

  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="mb-3 inline-flex items-center justify-center">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle
                cx="12"
                cy="12"
                r="9"
                stroke="#111827"
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray="42 14"
              />
              <circle cx="17.5" cy="8" r="2.25" fill="#22C55E" />
            </svg>
          </div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink">Sign in to Capita</h1>
          <p className="mt-1 text-sm text-ink-muted">All your crypto. One place.</p>
        </div>

        <Panel className="p-6">
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-ink-secondary">
              Connect a self-custodial EVM wallet (MetaMask, Rabby, Rainbow, or Coinbase Wallet) to
              view your cross-chain portfolio, build strategies, and request live 1Click quotes.
            </p>

            {error ? (
              <div
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50/80 p-3 text-xs text-danger-text"
              >
                {error}
              </div>
            ) : null}

            <button
              type="button"
              onClick={handleSignIn}
              disabled={busy}
              data-loading={busy ? "true" : undefined}
              className="btn btn-primary h-11 w-full justify-center text-sm"
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" strokeWidth={1.5} aria-hidden />
              ) : (
                <Wallet className="size-4" strokeWidth={1.5} aria-hidden />
              )}
              <span>{busy ? "Signing in…" : "Connect wallet"}</span>
            </button>

            <div className="flex gap-2.5 border-t border-line pt-4 text-xs leading-relaxed text-ink-muted">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent-text" strokeWidth={1.5} aria-hidden />
              <div>
                <p className="font-medium text-ink">Non-custodial by design</p>
                <p className="mt-0.5">
                  Signing this EIP-4361 message proves address ownership without exposing private
                  keys or authorizing fund transfers. Every money step asks for a separate explicit
                  signature.
                </p>
              </div>
            </div>
          </div>
        </Panel>

        <div className="flex items-center justify-center gap-4 text-xs text-ink-muted">
          <Link href="/opportunities" className="inline-flex items-center gap-1 hover:text-ink">
            <span>Opportunities</span>
            <ArrowRight className="size-3.5" strokeWidth={1.5} aria-hidden />
          </Link>
          <span className="text-line-strong" aria-hidden>
            ·
          </span>
          <Link href="/execute" className="inline-flex items-center gap-1 hover:text-ink">
            <span>Execution console</span>
            <ArrowRight className="size-3.5" strokeWidth={1.5} aria-hidden />
          </Link>
        </div>
      </div>
    </div>
  );
}
