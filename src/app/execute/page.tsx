import { Suspense } from "react";
import { ExecuteMove } from "@/components/execution/execute-move";
import { Panel } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

export default function ExecutePage() {
  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Execution</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Cross-chain move</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Move USDC between Base and Arbitrum through NEAR Intents 1Click. Preview first: the quote,
          the balances and the guardrail verdict are real. Execution requires live mode, an explicit
          approval and a wallet signature.
        </p>
      </header>

      <Panel>
        <p className="px-4 py-3 text-xs leading-relaxed text-ink-muted">
          <span className="font-semibold text-ink">Scope.</span> The executable surface today is a
          single 1Click swap: USDC on Base, USDC on Arbitrum, one leg at a time. Lending, LP and
          vault legs remain research-only because their direct protocol adapters are not verified.
          A single swap is not atomic, and a multi-leg plan is a sequence of independently
          confirmed moves.
        </p>
      </Panel>

      <Suspense fallback={<div className="panel p-6 text-sm text-ink-muted">Loading execution console…</div>}>
        <ExecuteMove />
      </Suspense>
    </div>
  );
}
