import { Panel, PanelHeader, StatusDot } from "@/components/ui/primitives";
import { getPrisma } from "@/lib/db/client";
import { formatDateTime, formatPercent, formatUsd, formatUsdDelta } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PositionsPage() {
  const positions = await getPrisma().position.findMany({
    include: {
      protocol: true,
      receiptToken: true,
      snapshots: { orderBy: { snapshotAt: "desc" }, take: 1 },
    },
    orderBy: { currentValueUsd: "desc" },
  });

  const deployed = positions.reduce((sum, p) => sum + (p.currentValueUsd ?? 0), 0);
  const pnl = positions.reduce((sum, p) => sum + (p.unrealisedPnlUsd ?? 0), 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">Management</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Positions</h1>
        </div>
        <div className="flex gap-6 text-sm">
          <div>
            <p className="eyebrow">Deployed</p>
            <p className="metric mt-1" data-numeric>
              {formatUsd(deployed)}
            </p>
          </div>
          <div>
            <p className="eyebrow">Unrealised</p>
            <p className={`metric mt-1 ${pnl >= 0 ? "text-accent" : "text-danger"}`} data-numeric>
              {formatUsdDelta(pnl)}
            </p>
          </div>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        {positions.map((position) => {
          const snapshot = position.snapshots[0];
          return (
            <Panel key={position.id}>
              <PanelHeader
                title={position.positionReference}
                eyebrow={position.protocol.name}
                meta={
                  <span className="chip capitalize">
                    <StatusDot tone={position.status === "open" ? "ok" : "idle"} />
                    {position.status}
                  </span>
                }
              />
              <div className="grid grid-cols-2 gap-4 px-5 py-4 sm:grid-cols-4">
                <Field label="Value" value={formatUsd(position.currentValueUsd)} />
                <Field
                  label="Rate"
                  value={snapshot ? formatPercent(snapshot.rateValue) : "—"}
                  hint={snapshot?.rateType ?? undefined}
                />
                <Field
                  label="Unrealised"
                  value={formatUsdDelta(position.unrealisedPnlUsd)}
                  tone={(position.unrealisedPnlUsd ?? 0) >= 0 ? "positive" : "negative"}
                />
                <Field
                  label="Accrued"
                  value={formatUsdDelta(position.accruedReturnUsd)}
                />
              </div>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line px-5 py-3 text-xs text-ink-faint">
                <span>
                  Chain: {position.chainId === 8453 ? "Base" : position.chainId === 42161 ? "Arbitrum One" : position.chainId}
                </span>
                <span>
                  Opened: {formatDateTime(position.openedAt)}
                </span>
                <span>Last synced: {formatDateTime(position.lastSyncedAt)}</span>
              </div>
            </Panel>
          );
        })}
      </div>

      <Panel>
        <div className="px-5 py-4 text-sm text-ink-muted">
          <p className="font-medium text-ink">Withdrawals are not wired yet.</p>
          <p className="mt-1 max-w-3xl">
            This screen reads the local position record. Withdraw, redeem and remove-liquidity
            actions require a direct protocol adapter plus wallet signing; they are deliberately
            not simulated here. Until then, no button pretends to move funds.
          </p>
        </div>
      </Panel>
    </div>
  );
}

function Field({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "positive" | "negative";
}) {
  const color = tone === "positive" ? "text-accent" : tone === "negative" ? "text-danger" : "text-ink";
  return (
    <div>
      <p className="eyebrow">{label}</p>
      <p className={`metric mt-1 text-sm ${color}`} data-numeric>
        {value}
      </p>
      {hint ? <p className="text-[10px] uppercase tracking-wide text-ink-faint">{hint}</p> : null}
    </div>
  );
}
