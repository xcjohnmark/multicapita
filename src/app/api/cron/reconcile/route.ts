import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db/client";
import { parseQuoteStatus, providerStatusToQuoteStatus } from "@/lib/domain/status";
import { getClient } from "@/lib/near/registry";
import { runPortfolioHealthCheck } from "@/lib/portfolio/monitoring";
import { isSameOrigin } from "@/lib/http/origin";

export const dynamic = "force-dynamic";

async function runReconciliation() {
  const prisma = getPrisma();
  const startedAt = new Date();

  // 1. Poll pending 1Click quotes (limit batch to 15 most recent)
  const pendingQuotes = await prisma.quote.findMany({
    where: {
      depositAddress: { not: null },
      status: { in: ["quoted", "deposited", "processing"] },
    },
    orderBy: { createdAt: "desc" },
    take: 15,
  });

  let quotesChecked = 0;
  let quotesUpdated = 0;
  for (const quote of pendingQuotes) {
    if (!quote.depositAddress) continue;
    quotesChecked += 1;
    try {
      const status = await getClient().getStatus(quote.depositAddress);
      const localStatus = providerStatusToQuoteStatus(status.status);
      const previous = parseQuoteStatus(quote.status);
      if (localStatus !== "unknown" && localStatus !== previous) {
        await prisma.$transaction([
          prisma.quote.update({ where: { id: quote.id }, data: { status: localStatus } }),
          prisma.quoteStatusEvent.create({
            data: {
              quoteId: quote.id,
              providerStatus: status.status,
              localStatus,
              raw: (status.raw ?? null) as object,
            },
          }),
        ]);
        quotesUpdated += 1;
      }
    } catch {
      // Leave pending if 1Click status temporarily unreachable
    }
  }

  // 2. Roll over copytrading dailyUsedUsd when updatedAt crossed UTC midnight
  const utcTodayStart = new Date(
    Date.UTC(startedAt.getUTCFullYear(), startedAt.getUTCMonth(), startedAt.getUTCDate()),
  );
  const rolledOverSubs = await prisma.copySubscription.updateMany({
    where: {
      dailyUsedUsd: { gt: 0 },
      updatedAt: { lt: utcTodayStart },
    },
    data: { dailyUsedUsd: 0 },
  });

  // 3. Health checks for users with open positions
  const openPosUsers = await prisma.position.findMany({
    where: { status: "open" },
    select: { userId: true },
    distinct: ["userId"],
    take: 25,
  });

  let healthAlertsCount = 0;
  for (const row of openPosUsers) {
    const report = await runPortfolioHealthCheck(row.userId);
    healthAlertsCount += report.alerts.length;
  }

  return {
    ok: true,
    ranAt: startedAt.toISOString(),
    quotesChecked,
    quotesUpdated,
    copyBudgetsReset: rolledOverSubs.count,
    usersHealthChecked: openPosUsers.length,
    healthAlertsCount,
  };
}

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  const expectedSecret = process.env.CRON_SECRET;
  if (expectedSecret && auth !== `Bearer ${expectedSecret}` && !isSameOrigin(request)) {
    return NextResponse.json({ error: { message: "Unauthorized reconciliation request." } }, { status: 401 });
  }
  const summary = await runReconciliation();
  return NextResponse.json(summary);
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: { message: "Cross-origin request refused." } }, { status: 403 });
  }
  const summary = await runReconciliation();
  return NextResponse.json(summary);
}
