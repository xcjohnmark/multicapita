import { PositionActions } from "@/components/positions/position-actions";
import { AssetIcon } from "@/components/ui/asset-icon";
import { ChainBadge, Panel, PanelHeader, StatusDot } from "@/components/ui/primitives";
import { SyncButton } from "@/components/ui/sync-button";
import { getViewer } from "@/lib/auth/viewer";
import { getPrisma } from "@/lib/db/client";
import { formatDateTime, formatPercent, formatUsd, formatUsdDelta } from "@/lib/format";
import { redirect } from "next/navigation";

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
    orderBy: [{ status: "asc" }, { currentValueUsd: "desc" }],
  });

  const openPositions = positions.filter((p) => p.status === "open");
  const deployed = openPositions.reduce((sum, p) => sum + (p.currentValueUsd ?? 0), 0);
  const pnl = openPositions.reduce((sum, p) => sum + (p.unrealisedPnlUsd ?? 0), 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">Management</p>
          <h1 className="mt-1 type-h4 text-ink">Positions</h1>
        </div>
        <div className="flex flex-wrap items-center gap-6 text-sm">
          <div>
            <p className="eyebrow">Deployed</p>
            <p className="metric mt-1 font-medium text-ink" data-numeric>
              {formatUsd(deployed)}
            </p>
          </div>
          <div>
            <p className="eyebrow">Unrealised</p>
            <p
              className={`metric mt-1 font-medium ${
                pnl >= 0 ? "text-accent-text" : "text-danger-text"
              }`}
              data-numeric
            >
              {formatUsdDelta(pnl)}
            </p>
          </div>
          {!viewer.demo ? (
            <SyncButton endpoint="/api/portfolio/sync" label="Refresh balances" variant="secondary" />
          ) : null}
        </div>
      </header>

      {positions.length === 0 ? (
        <Panel>
          <div className="px-5 py-10 text-center text-sm text-ink-muted">
            No active or historical positions yet. Deploy capital from Opportunities or the Execute
            console to start tracking positions here.
          </div>
        </Panel>
      ) : (
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
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface px-5 py-3 text-xs text-ink-muted">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <ChainBadge chainId={position.chainId} />
                    <span>Opened: {formatDateTime(position.openedAt)}</span>
                    <span>Synced: {formatDateTime(position.lastSyncedAt)}</span>
                  </div>
                  {position.status === "open" ? (
                    <PositionActions
                      strategyType={position.strategyType}
                      chainId={position.chainId}
                      currentValueUsd={position.currentValueUsd}
                      contractAddress={position.receiptToken?.contractAddress}
                    />
                  ) : null}
                </div>
              </Panel>
            );
          })}
        </div>
      )}
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
  const toneClass =
    tone === "positive"
      ? "text-accent-text"
      : tone === "negative"
        ? "text-danger-text"
        : "text-ink";

  return (
    <div>
      <p className="eyebrow">{label}</p>
      <p className={`metric mt-1 text-sm font-medium ${toneClass}`} data-numeric>
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-xs uppercase text-ink-faint">{hint}</p> : null}
    </div>
  );
}
