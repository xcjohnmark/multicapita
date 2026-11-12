import { redirect } from "next/navigation";
import { AssetIcon } from "@/components/ui/asset-icon";
import { ChainBadge, Panel, PanelHeader, StatusDot } from "@/components/ui/primitives";
import { getViewer } from "@/lib/auth/viewer";
import { getPrisma } from "@/lib/db/client";
import { formatDateTime, formatPercent, formatUsd, formatUsdDelta } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PositionsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/signin");

  const positions = await getPrisma().position.findMany({
    where: { userId: viewer.userId },
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
      <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">Management</p>
          <h1 className="mt-1 text-[22px] font-semibold tracking-tight text-ink">Positions</h1>
        </div>
        <div className="flex gap-6 text-sm">
          <div>
            <p className="eyebrow">Deployed</p>
            <p className="metric mt-1 font-semibold text-ink" data-numeric>
              {formatUsd(deployed)}
            </p>
          </div>
          <div>
            <p className="eyebrow">Unrealised</p>
            <p
              className={`metric mt-1 font-semibold ${
                pnl >= 0 ? "text-accent-text" : "text-danger-text"
              }`}
              data-numeric
            >
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
                  <div className="flex items-center gap-2">
                    <AssetIcon symbolOrName={position.protocol.name} size="sm" />
                    <span className="chip capitalize">
                      <StatusDot tone={position.status === "open" ? "ok" : "idle"} />
                      {position.status}
                    </span>
                  </div>
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
                <Field label="Accrued" value={formatUsdDelta(position.accruedReturnUsd)} />
              </div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line bg-surface px-5 py-3 text-xs text-ink-muted">
                <ChainBadge chainId={position.chainId} />
                <span>Opened: {formatDateTime(position.openedAt)}</span>
                <span>Last synced: {formatDateTime(position.lastSyncedAt)}</span>
              </div>
            </Panel>
          );
        })}
      </div>

      <Panel variant="inset">
        <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between text-sm text-ink-secondary">
          <div>
            <p className="font-medium text-ink">Manage & Withdraw Protocol Positions</p>
            <p className="mt-1 max-w-2xl text-xs text-ink-muted">
              Burn aTokens or remove liquidity using verified protocol adapters on Base and Arbitrum. Every withdrawal requires an explicit self-custodial wallet signature.
            </p>
          </div>
          <a href="/execute" className="btn btn-primary h-9 px-4 text-xs shrink-0 self-start sm:self-auto">
            <span>Open Withdrawal Rail</span>
          </a>
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
  const color =
    tone === "positive"
      ? "text-accent-text"
      : tone === "negative"
        ? "text-danger-text"
        : "text-ink";
  return (
    <div>
      <p className="eyebrow">{label}</p>
      <p className={`metric mt-1 text-sm font-medium ${color}`} data-numeric>
        {value}
      </p>
      {hint ? <p className="text-[10px] uppercase tracking-wide text-ink-muted">{hint}</p> : null}
    </div>
  );
}
