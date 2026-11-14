import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db/client";
import { clientKey, rateLimited } from "@/lib/http/rate-limit";
import { formatPercent } from "@/lib/format";
import { toCard } from "@/lib/opportunities/queries";
import { chainLabel } from "@/lib/opportunities/tabs";

export const dynamic = "force-dynamic";

/** Header search: active opportunities and tracked traders. Read-only, no viewer data. */
export async function GET(request: Request) {
  if (rateLimited(`search:${clientKey(request)}`, { max: 120 })) {
    return NextResponse.json({ error: { message: "Too many searches." } }, { status: 429 });
  }
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().toLowerCase().slice(0, 64);
  const prisma = getPrisma();
  const [rows, traders] = await Promise.all([
    prisma.opportunity.findMany({
      where: { status: "active" },
      include: { protocol: true, observations: { take: 0, select: { rate: true, observedAt: true } } },
      orderBy: { estimatedApy: { sort: "desc", nulls: "last" } },
      take: 200,
    }),
    prisma.trackedTrader.findMany({ orderBy: { lastIndexedAt: "desc" }, take: 50 }),
  ]);

  const opportunityHits = rows
    .map((row) => toCard(row))
    .filter((card) =>
      q ? [card.title, card.protocolName, ...card.assetSymbols, card.ticker ?? "", chainLabel(card.chainId)].join(" ").toLowerCase().includes(q) : true,
    )
    .slice(0, 12)
    .map((card) => ({
      kind: "opportunity" as const,
      id: card.id,
      href: `/opportunities/${card.tab}/${card.id}`,
      title: card.title,
      subtitle: `${card.protocolName} · ${chainLabel(card.chainId)}`,
      hint: card.ratePercent !== null ? formatPercent(card.ratePercent) : null,
    }));

  const traderHits = traders
    .filter((t) => (q ? [t.label ?? "", t.resolvedHandle ?? "", t.address].join(" ").toLowerCase().includes(q) : true))
    .slice(0, 6)
    .map((t) => ({
      kind: "trader" as const,
      id: t.address,
      href: `/opportunities/copytrading/${encodeURIComponent(t.address)}`,
      title: t.label ?? t.resolvedHandle ?? `${t.address.slice(0, 6)}…${t.address.slice(-4)}`,
      subtitle: t.primaryStyle,
      hint: null,
    }));

  return NextResponse.json({ data: [...opportunityHits, ...traderHits] });
}
