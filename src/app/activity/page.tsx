import { Panel, PanelHeader } from "@/components/ui/primitives";
import { getPrisma } from "@/lib/db/client";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const events = await getPrisma().auditEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Audit</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Activity</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Proposals, approvals, quotes, submissions and reconciliation events are recorded here.
          This log is append-only by convention and never stores secrets.
        </p>
      </header>

      <Panel>
        <PanelHeader title="Event log" eyebrow={`${events.length} most recent`} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="px-5 py-2.5 text-xs font-medium text-ink-faint">Time</th>
                <th className="px-5 py-2.5 text-xs font-medium text-ink-faint">Event</th>
                <th className="px-5 py-2.5 text-xs font-medium text-ink-faint">Actor</th>
                <th className="px-5 py-2.5 text-xs font-medium text-ink-faint">Reference</th>
                <th className="px-5 py-2.5 text-xs font-medium text-ink-faint">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {events.map((event) => (
                <tr key={event.id}>
                  <td className="whitespace-nowrap px-5 py-3 text-xs text-ink-faint">
                    {formatDateTime(event.createdAt)}
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-ink">{event.eventType}</td>
                  <td className="px-5 py-3 text-xs capitalize text-ink-muted">{event.actorType}</td>
                  <td className="px-5 py-3 font-mono text-xs text-ink-faint">
                    {event.referenceId ?? "—"}
                  </td>
                  <td className="max-w-[320px] px-5 py-3">
                    <pre className="truncate font-mono text-[11px] text-ink-faint">
                      {event.details ? JSON.stringify(event.details) : "—"}
                    </pre>
                  </td>
                </tr>
              ))}
              {events.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-sm text-ink-muted">
                    No events recorded yet.
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
