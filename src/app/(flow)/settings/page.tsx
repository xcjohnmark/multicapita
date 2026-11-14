import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { FlowPage } from "@/components/shell/layout-chrome";
import { GuardrailsForm, ResetDemoButton } from "@/components/settings/settings-forms";
import { buttonClass } from "@/components/ui/button";
import { WalletsCard } from "@/components/wallet/wallets-card";
import { loadGuardrails } from "@/lib/execution/api";
import { isSimulatedFor } from "@/lib/execution/plan/scope";
import { getCurrentSession, getCurrentViewer } from "@/lib/platform-context";
import { listAccountWallets } from "@/lib/wallet/accounts";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const viewer = await getCurrentViewer();
  if (!viewer) redirect("/signin");
  const [session, guardrails, wallets] = await Promise.all([
    getCurrentSession(),
    loadGuardrails(viewer.userId),
    viewer.demo ? Promise.resolve([]) : listAccountWallets(viewer.userId, viewer.address),
  ]);

  return (
    <FlowPage title="Settings">
      <div className="space-y-4">
        <Card title="Wallets" sub={viewer.demo ? "Sign in to add your wallets." : "Every wallet you add counts toward your balance."}>
          {viewer.demo ? (
            <Link href="/signin" className={buttonClass("primary", "lg", "w-full")}>
              Connect wallet
            </Link>
          ) : (
            <WalletsCard wallets={wallets} signedInAddress={viewer.address} />
          )}
        </Card>

        <Card title="Guardrails" sub="Checked on every plan before you can approve it.">
          <GuardrailsForm
            readOnly={viewer.demo}
            initial={{
              minLiquidPercent: guardrails.minLiquidPercent,
              maxProtocolExposurePercent: guardrails.maxProtocolExposurePercent,
              maxChainExposurePercent: guardrails.maxChainExposurePercent,
              maxStrategyExposurePercent: guardrails.maxStrategyExposurePercent,
              maxSlippageBps: guardrails.maxSlippageBps,
            }}
          />
        </Card>

        <Card title="Limits" sub={`${session.dataModeLabel}. Live plans above these are refused.`}>
          <dl className="grid grid-cols-2 gap-2">
            <div className="rounded-[var(--radius-control)] bg-surface px-4 py-3">
              <dt className="text-sm text-ink-muted">Per plan</dt>
              <dd className="figure mt-0.5 text-xl text-ink">${session.maxMoveUsdc}</dd>
            </div>
            <div className="rounded-[var(--radius-control)] bg-surface px-4 py-3">
              <dt className="text-sm text-ink-muted">Per day</dt>
              <dd className="figure mt-0.5 text-xl text-ink">${session.maxDailyUsdc}</dd>
            </div>
          </dl>
        </Card>

        {isSimulatedFor(viewer) ? (
          <Card title="Simulations" sub={viewer.demo ? "Kept in this browser only." : "Kept on this account only."}>
            <ResetDemoButton />
          </Card>
        ) : null}
      </div>
    </FlowPage>
  );
}

function Card({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return (
    <section className="card-tile p-5">
      <h2 className="type-h6 text-ink">{title}</h2>
      <p className="mt-1 mb-4 text-sm text-pretty text-ink-muted">{sub}</p>
      {children}
    </section>
  );
}
