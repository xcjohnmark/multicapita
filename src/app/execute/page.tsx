import { Suspense } from "react";
import { ExecuteMove } from "@/components/execution/execute-move";
import { ProtocolDeploy } from "@/components/execution/protocol-deploy";
import { Panel } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

export default function ExecutePage() {
  return (
    <div className="space-y-8">
      <header>
        <p className="eyebrow">Execution Console</p>
        <h1 className="mt-1 type-h4 text-ink">
          Mainnet Cross-Chain & Protocol Execution
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-muted">
          Execute cross-chain capital consolidation via NEAR Intents 1Click, or deploy settled
          funds directly into live destination protocols (Aave V3, Uniswap V3 concentrated LP, and
          verified tokenized equities) using self-custodial wallet signatures.
        </p>
      </header>

      <Panel variant="inset">
        <p className="px-5 py-3.5 text-xs leading-relaxed text-ink-secondary">
          <span className="font-medium text-ink">Two-Step Non-Atomic Rail.</span> In Capita, multi-leg strategies are an explicit sequence of independently confirmed steps: Step 1 (1Click cross-chain routing) followed by Step 2 (destination protocol supply or equity swap). Every step requires explicit human approval and wallet signature.
        </p>
      </Panel>

      <section className="space-y-4">
        <div>
          <h2 className="type-card-title text-ink">Step 1: Cross-Chain Liquidity Rail (1Click)</h2>
          <p className="text-xs text-ink-muted">Consolidate USDC across Base and Arbitrum One. A quote outside your slippage limit is refused.</p>
        </div>
        <Suspense
          fallback={
            <div className="panel p-6 text-sm text-ink-muted">Loading cross-chain console…</div>
          }
        >
          <ExecuteMove />
        </Suspense>
      </section>

      <section className="space-y-4 pt-4 border-t border-line">
        <div>
          <h2 className="type-card-title text-ink">Step 2: Destination Protocol Deployment & Withdrawal</h2>
          <p className="text-xs text-ink-muted">Deposit settled capital into Aave V3 lending pools, Uniswap concentrated LPs, or tokenized equities with live NAV spread checks.</p>
        </div>
        <Suspense
          fallback={
            <div className="panel p-6 text-sm text-ink-muted">Loading protocol console…</div>
          }
        >
          <ProtocolDeploy />
        </Suspense>
      </section>
    </div>
  );
}
