import { redirect } from "next/navigation";
import { AlertTriangle, CheckCircle, FileText, Info, ShieldCheck } from "lucide-react";
import { Panel, PanelHeader, StatusDot } from "@/components/ui/primitives";
import { getViewer } from "@/lib/auth/viewer";
import { getPrisma } from "@/lib/db/client";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/signin");

  const events = await getPrisma().auditEvent.findMany({
    where: { userId: viewer.userId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const alertsCount = events.filter((e) => e.eventType.startsWith("health_alert")).length;
  const executionCount = events.filter((e) => e.eventType.includes("execution") || e.eventType.includes("position")).length;

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">Audit & Compliance</p>
          <h1 className="mt-1 text-[22px] font-semibold tracking-tight text-ink">
            Activity & Security Log
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
            Immutable, append-only audit trail capturing every strategy proposal, guardrail verdict,
            wallet signature, settlement state, and automated position health alert.
          </p>
        </div>

        <div className="flex gap-4 text-xs">
          <div className="rounded-lg border border-line bg-surface px-3 py-2">
            <span className="eyebrow">Total Events</span>
            <p className="font-mono font-semibold text-ink text-sm">{events.length}</p>
          </div>
          <div className="rounded-lg border border-line bg-surface px-3 py-2">
            <span className="eyebrow">Health Alerts</span>
            <p className="font-mono font-semibold text-amber-700 text-sm">{alertsCount}</p>
          </div>
          <div className="rounded-lg border border-line bg-surface px-3 py-2">
            <span className="eyebrow">Executions</span>
            <p className="font-mono font-semibold text-accent-text text-sm">{executionCount}</p>
          </div>
        </div>
      </header>

      <Panel>
        <PanelHeader
          title="Audit Trail"
          eyebrow={`${events.length} records captured`}
          meta={
            <span className="chip border-green-200 bg-green-50 text-accent-text">
              <ShieldCheck className="size-3.5" /> Immutable Log
            </span>
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line bg-surface text-left">
                <th className="eyebrow px-5 py-2.5">Time (UTC)</th>
                <th className="eyebrow px-5 py-2.5">Event Type</th>
                <th className="eyebrow px-5 py-2.5">Actor</th>
                <th className="eyebrow px-5 py-2.5">Reference ID</th>
                <th className="eyebrow px-5 py-2.5">Audit Payload</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-faint">
              {events.map((event) => {
                const isAlert = event.eventType.startsWith("health_alert");
                const isSuccess = event.eventType.includes("recorded") || event.eventType.includes("settled");
                const tone = isAlert ? "warn" : isSuccess ? "ok" : "idle";

                return (
                  <tr key={event.id} className="transition-colors duration-100 hover:bg-surface-hover">
                    <td className="whitespace-nowrap px-5 py-3 text-xs text-ink-muted">
                      {formatDateTime(event.createdAt)}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-mono font-medium ${
                          isAlert
                            ? "bg-amber-50 text-amber-800 border border-amber-200"
                            : isSuccess
                              ? "bg-green-50 text-green-800 border border-green-200"
                              : "bg-surface text-ink-secondary border border-line"
                        }`}
                      >
                        <StatusDot tone={tone} />
                        {event.eventType}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs capitalize text-ink-secondary">
                      {event.actorType}
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-ink-muted">
                      {event.referenceId ? `${event.referenceId.slice(0, 10)}…` : "—"}
                    </td>
                    <td className="max-w-[340px] px-5 py-3">
                      <pre className="truncate font-mono text-[11px] text-ink-secondary bg-surface px-2 py-1 rounded border border-line/60">
                        {event.details ? JSON.stringify(event.details) : "—"}
                      </pre>
                    </td>
                  </tr>
                );
              })}
              {events.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-sm text-ink-muted">
                    No activity events recorded yet. Connect a wallet and execute a strategy or move to generate audit entries.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
