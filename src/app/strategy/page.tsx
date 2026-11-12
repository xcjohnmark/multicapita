import Link from "next/link";
import { redirect } from "next/navigation";
import { StrategyBuilder } from "@/components/strategy/strategy-builder";
import { DataModeBanner, EmptyState, Panel, StatusDot } from "@/components/ui/primitives";
import { getViewer } from "@/lib/auth/viewer";
import { hasAiCredentials } from "@/lib/env";
import { formatUsd } from "@/lib/format";
import { loadStrategyContext } from "@/lib/portfolio/strategy-context";

export const dynamic = "force-dynamic";

export default async function StrategyPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/signin");

  const context = await loadStrategyContext(viewer.userId);

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Planning</p>
        <h1 className="mt-1 text-[22px] font-semibold tracking-tight text-ink">Strategy</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Describe the outcome you want. The model selects opportunities and explains itself; the
          deterministic policy engine — not the model — decides whether the plan is allowed.
        </p>
      </header>

      {context ? (
        <>
          <DataModeBanner
            dataMode={context.dataMode}
            title="Fixture portfolio."
            message="Guardrails and opportunity rates come from labelled sample rows. The planner and the policy engine are real; the market numbers are not."
          />

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
                <h2 className="text-base font-medium tracking-tight text-ink">
                  {context.opportunities.length} opportunit
                  {context.opportunities.length === 1 ? "y" : "ies"} the planner may choose from
                </h2>
              </div>
              <span className="chip">
                <StatusDot tone="idle" />
                {formatUsd(context.target.availableUsd, { whole: true })} liquid
              </span>
            </div>
            <ul className="divide-y divide-line-faint">
              {context.opportunities.slice(0, 8).map((opportunity) => (
                <li
                  key={opportunity.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-xs transition-colors duration-100 hover:bg-surface-hover"
                >
                  <span className="text-ink-muted">
                    <span className="font-medium text-ink">{opportunity.protocolName}</span> ·{" "}
                    {opportunity.assetLabel} · {opportunity.chainName}
                  </span>
                  <span className="flex items-center gap-3 text-ink-muted">
                    <span className="metric font-medium text-ink" data-numeric>
                      {opportunity.expectedRatePercent === null
                        ? "no sourced rate"
                        : `${opportunity.expectedRatePercent.toFixed(2)}%`}
                    </span>
                    <span className="chip text-[10px]">{opportunity.dataMode}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="border-t border-line bg-surface px-5 py-3 text-xs text-ink-muted">
              Full detail, sources, and observation times on{" "}
              <Link
                href="/opportunities"
                className="font-medium text-ink underline decoration-line-strong underline-offset-2"
              >
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
              <code className="rounded-lg border border-line bg-surface px-3 py-2 font-mono text-xs text-ink-secondary">
                npx prisma migrate dev &amp;&amp; npm run db:seed
              </code>
            }
          />
        </Panel>
      )}
    </div>
  );
}
