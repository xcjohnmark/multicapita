import Link from "next/link";
import { redirect } from "next/navigation";
import { PositionCard } from "@/components/portfolio/cards";
import { buttonClass } from "@/components/ui/button";
import { formatUsd } from "@/lib/format";
import { getCurrentPortfolio, getCurrentViewer } from "@/lib/platform-context";

export const dynamic = "force-dynamic";

export default async function PositionsPage() {
  const viewer = await getCurrentViewer();
  if (!viewer) redirect("/signin");
  const portfolio = await getCurrentPortfolio();
  const now = new Date();
  const open = portfolio?.openPositions ?? [];
  const closed = (portfolio?.positions ?? []).filter((p) => p.status === "closed");

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="type-h3 text-ink">Positions</h1>
          <p className="mt-1 text-ink-muted tabular-nums">
            {open.length} open · {formatUsd(portfolio?.totals.deployedUsd ?? 0)} deployed
          </p>
        </div>
        <Link href="/opportunities/lending" className={buttonClass("primary", "md")}>
          New position
        </Link>
      </div>

      {open.length ? (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {open.map((position) => (
            <li key={position.id} className="contents">
              <PositionCard position={position} now={now} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="card-tile items-center px-6 py-16 text-center">
          <p className="type-card-title text-ink">No open positions</p>
          <p className="mt-1.5 text-sm text-ink-muted">Explore a market and press Execute to open one.</p>
          <Link href="/opportunities/lending" className={buttonClass("primary", "md", "mt-5")}>
            Explore opportunities
          </Link>
        </div>
      )}

      {closed.length ? (
        <section>
          <h2 className="type-h5 mb-4 text-ink">Closed</h2>
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {closed.map((position) => (
              <li key={position.id} className="contents">
                <PositionCard position={position} now={now} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
