import Link from "next/link";
import { redirect } from "next/navigation";
import { PlanRow } from "@/components/portfolio/cards";
import { buttonClass } from "@/components/ui/button";
import { getPrisma } from "@/lib/db/client";
import { formatDateTime } from "@/lib/format";
import { getCurrentPortfolio, getCurrentViewer } from "@/lib/platform-context";

export const dynamic = "force-dynamic";

const EVENT_LABELS: Record<string, string> = {
  "plan.created": "Plan built",
  "plan.approved": "Plan approved",
  "plan.completed": "Plan completed",
  "plan.cancelled": "Plan cancelled",
  "demo.seeded": "Sample portfolio loaded",
};

function dayLabel(date: Date, now: Date) {
  const key = (d: Date) => d.toISOString().slice(0, 10);
  if (key(date) === key(now)) return "Today";
  const yesterday = new Date(now.getTime() - 86_400_000);
  if (key(date) === key(yesterday)) return "Yesterday";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

export default async function ActivityPage() {
  const viewer = await getCurrentViewer();
  if (!viewer) redirect("/signin");
  // Loading the portfolio also settles any simulated plan that finished while nobody was looking.
  const portfolio = await getCurrentPortfolio();
  const scopeFilter = viewer.demo ? { simulationKey: portfolio?.scope ?? "__none__" } : {};
  const now = new Date();

  const [plans, events] = await Promise.all([
    getPrisma().executionPlan.findMany({
      where: { userId: viewer.userId, status: { not: "draft" }, ...scopeFilter },
      include: { steps: { select: { status: true } } },
      orderBy: { createdAt: "desc" },
      take: 60,
    }),
    // The shared demo account's audit log mixes every visitor's actions; only signed-in users see theirs.
    viewer.demo
      ? Promise.resolve([])
      : getPrisma().auditEvent.findMany({ where: { userId: viewer.userId }, orderBy: { createdAt: "desc" }, take: 40 }),
  ]);

  const groups = new Map<string, typeof plans>();
  for (const plan of plans) {
    const label = dayLabel(plan.createdAt, now);
    groups.set(label, [...(groups.get(label) ?? []), plan]);
  }

  return (
    <div className="space-y-10">
      <div>
        <h1 className="type-h3 text-ink">Activity</h1>
        <p className="mt-1 text-ink-muted">Every plan you approved, step by step.</p>
      </div>

      {plans.length === 0 ? (
        <div className="card-tile items-center px-6 py-16 text-center">
          <p className="type-card-title text-ink">No activity yet</p>
          <p className="mt-1.5 text-sm text-ink-muted">Approve a plan and it shows up here.</p>
          <Link href="/opportunities/lending" className={buttonClass("primary", "md", "mt-5")}>
            Explore opportunities
          </Link>
        </div>
      ) : (
        [...groups.entries()].map(([label, items]) => (
          <section key={label}>
            <h2 className="mb-2 text-[0.9375rem] text-ink-muted">{label}</h2>
            <div className="card-tile p-2">
              {items.map((plan) => (
                <PlanRow key={plan.id} plan={plan} now={now} />
              ))}
            </div>
          </section>
        ))
      )}

      {events.length ? (
        <details className="card-tile group p-5">
          <summary className="flex cursor-pointer list-none items-center justify-between">
            <span className="type-card-title text-ink">Audit log</span>
            <span className="text-sm text-ink-muted group-open:hidden">Show {events.length}</span>
            <span className="hidden text-sm text-ink-muted group-open:inline">Hide</span>
          </summary>
          <ul className="mt-4 divide-y divide-line-faint">
            {events.map((event) => (
              <li key={event.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <span className="text-ink">{EVENT_LABELS[event.eventType] ?? event.eventType}</span>
                <span className="text-ink-muted tabular-nums">
                  {event.actorType} · {formatDateTime(event.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
