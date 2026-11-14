"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { Wordmark } from "@/components/shell/logo";
import { WalletPicker } from "@/components/wallet/wallet-picker";

export default function SignInPage() {
  const router = useRouter();
  return (
    <div className="flex min-h-[75dvh] flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center">
          <Wordmark size="lg" />
          <h1 className="type-h4 mt-4 text-balance text-ink">Connect a wallet</h1>
        </div>
        <div className="mt-8">
          <WalletPicker
            mode="signin"
            onDone={() => {
              router.push("/app");
              router.refresh();
            }}
          />
        </div>
        <p className="mt-8 flex items-center justify-center gap-2 text-sm text-ink-muted">
          <ShieldCheck className="size-4 text-accent-text" strokeWidth={1.5} aria-hidden />
          Non-custodial. Your keys stay in your wallet.
        </p>
        <p className="mt-3 text-center text-sm">
          <Link href="/opportunities/lending" className="text-ink-secondary hover:text-ink">
            Browse without signing in
          </Link>
        </p>
      </div>
    </div>
  );
}
