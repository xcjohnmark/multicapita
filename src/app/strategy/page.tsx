import Link from "next/link";
import { StrategyBuilder } from "@/components/strategy/strategy-builder";
import { EmptyState, Panel, StatusDot } from "@/components/ui/primitives";
import { hasAiCredentials } from "@/lib/env";
import { loadStrategyContext } from "@/lib/portfolio/strategy-context";
import { formatUsd } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function StrategyPage() {
  const context = await loadStrategyContext();

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Planning</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Strategy</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Describe the outcome you want. The model selects opportunities and explains itself; the
          policy engine — not the model — decides whether the plan is allowed.
        </p>
      </header>

      {context ? (
        <>
          {context.dataMode !== "live" ? (
            <div className="rounded-panel border border-warn/30 bg-warn/[0.06] px-4 py-3 text-sm">
              <span className="font-semibold text-warn">Fixture portfolio.</span> Guardrails and
              opportunity rates come from labelled sample rows. The planner and the policy engine
              are real; the market numbers are not.
            </div>
          ) : null}

          <StrategyBuilder
            aiConfigured={hasAiCredentials}
            defaults={{
              totalUsd: context.target.totalUsd,
              availableUsd: context.target.availableUsd,
              minLiquidPercent: context.guardrails.minLiquidPercent,
              maxProtocol: context.guardrails.maxProtocolExposurePercent,
              maxChain: context.guardrails.maxChainExposurePercent,
              maxStrategy: context.guardrails.maxStrategyExposurePercent,
            }}
          />

          <Panel>
            <div className="panel-header">
              <div>
                <p className="eyebrow mb-1">Candidate set</p>
                <h2 className="text-sm font-semibold">
                  {context.opportunities.length} opportunit
                  {context.opportunities.length === 1 ? "y" : "ies"} the planner may choose from
                </h2>
              </div>
              <span className="chip">
                <StatusDot tone="idle" />
                {formatUsd(context.target.availableUsd, { whole: true })} liquid
              </span>
            </div>
            <ul className="divide-y divide-line">
              {context.opportunities.slice(0, 8).map((opportunity) => (
                <li
                  key={opportunity.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-xs"
                >
                  <span className="text-ink-muted">
                    <span className="text-ink">{opportunity.protocolName}</span> ·{" "}
                    {opportunity.assetLabel} · {opportunity.chainName}
                  </span>
                  <span className="flex items-center gap-3 text-ink-faint">
                    <span className="metric" data-numeric>
                      {opportunity.expectedRatePercent === null
                        ? "no sourced rate"
                        : `${opportunity.expectedRatePercent.toFixed(2)}%`}
                    </span>
                    <span className="chip text-[10px]">{opportunity.dataMode}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="border-t border-line px-4 py-3 text-[11px] text-ink-faint">
              Full detail, sources and observation times on{" "}
              <Link href="/opportunities" className="underline decoration-line-strong underline-offset-2">
                Opportunities
              </Link>
              .
            </p>
          </Panel>
        </>
      ) : (
        <Panel>
          <EmptyState
            title="No portfolio to plan against"
            description="Create the database and seed the labelled sample portfolio, then reload this page."
            action={
              <code className="rounded-md border border-line bg-canvas px-3 py-1.5 font-mono text-xs text-ink-muted">
                npx prisma migrate dev &amp;&amp; npm run db:seed
              </code>
            }
          />
        </Panel>
      )}
    </div>
  );
}
