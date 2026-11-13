import { NextResponse } from "next/server";
import { z } from "zod";
import { getViewer } from "@/lib/auth/viewer";
import { inspectTraderWallet } from "@/lib/copytrading/indexer";
import { generateTraderXrayBriefing } from "@/lib/copytrading/xray";
import { getPrisma } from "@/lib/db/client";
import { isSameOrigin } from "@/lib/http/origin";
import { clientKey, rateLimited } from "@/lib/http/rate-limit";

export const dynamic = "force-dynamic";

const inspectSchema = z.object({
  addressOrHandle: z.string().trim().min(3).max(120),
  label: z.string().trim().max(80).optional(),
});

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: { message: "Cross-origin request refused." } }, { status: 403 });
  }
  if (rateLimited(`copy-inspect:${clientKey(request)}`, { max: 12 })) {
    return NextResponse.json(
      { error: { message: "Too many wallet X-Ray lookups. Wait a minute." } },
      { status: 429 },
    );
  }

  const viewer = await getViewer();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { message: "Invalid JSON body." } }, { status: 400 });
  }

  const parsed = inspectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { message: "Enter a valid wallet address, .eth, .near, or .sol identifier." } },
      { status: 400 },
    );
  }

  try {
    const inspection = await inspectTraderWallet(parsed.data.addressOrHandle);
    const briefing = await generateTraderXrayBriefing(inspection);
    const prisma = getPrisma();

    const saved = await prisma.trackedTrader.upsert({
      where: {
        ecosystem_address: {
          ecosystem: inspection.ecosystem,
          address: inspection.address,
        },
      },
      update: {
        resolvedHandle: inspection.resolvedHandle,
        label: parsed.data.label ?? undefined,
        primaryStyle: inspection.score.styleLabel,
        indexerSources: inspection.indexerSources,
        isMemecoinFree: inspection.score.isMemecoinFree,
        hasExternalHedgeWarning: true,
        positionsJson: inspection.positions,
        aiSummary: briefing.summary,
        dataMode: inspection.dataMode,
        lastIndexedAt: new Date(inspection.observedAt),
      },
      create: {
        address: inspection.address,
        ecosystem: inspection.ecosystem,
        resolvedHandle: inspection.resolvedHandle,
        label: parsed.data.label ?? (inspection.resolvedHandle || `Tracked ${inspection.ecosystem.toUpperCase()} Trader`),
        primaryStyle: inspection.score.styleLabel,
        indexerSources: inspection.indexerSources,
        realisedPnl90dUsd: inspection.realisedPnl90dUsd,
        winRatePercent: inspection.winRatePercent,
        maxDrawdownPercent: inspection.maxDrawdownPercent,
        isMemecoinFree: inspection.score.isMemecoinFree,
        hasExternalHedgeWarning: true,
        positionsJson: inspection.positions,
        aiSummary: briefing.summary,
        dataMode: inspection.dataMode,
        lastIndexedAt: new Date(inspection.observedAt),
      },
    });

    await prisma.auditEvent.create({
      data: {
        userId: viewer?.userId ?? null,
        eventType: "copytrading.wallet_inspected",
        actorType: "user",
        referenceId: saved.id,
        details: {
          address: inspection.address,
          ecosystem: inspection.ecosystem,
          style: inspection.score.styleLabel,
          isMemecoinFree: inspection.score.isMemecoinFree,
          positionsCount: inspection.positions.length,
          aiSource: briefing.source,
        },
      },
    });

    return NextResponse.json({
      data: {
        trader: saved,
        inspection,
        briefing,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: { message: err instanceof Error ? err.message : "Failed to inspect wallet." } },
      { status: 400 },
    );
  }
}
