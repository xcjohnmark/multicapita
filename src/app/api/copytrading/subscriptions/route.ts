import { NextResponse } from "next/server";
import { z } from "zod";
import { getViewer } from "@/lib/auth/viewer";
import { buildNearCopySetupDescriptor } from "@/lib/copytrading/agent-api";
import { SAMPLE_TOP_PERFORMERS } from "@/lib/copytrading/indexer";
import { getPrisma } from "@/lib/db/client";
import { isSameOrigin } from "@/lib/http/origin";
import { clientKey, rateLimited } from "@/lib/http/rate-limit";

export const dynamic = "force-dynamic";

const createSubscriptionSchema = z.object({
  traderAddress: z.string().trim().min(3).max(120),
  ecosystem: z.enum(["evm", "near", "solana"]).default("evm"),
  fundingNearAccountId: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9._-]+$/i, "Enter a valid NEAR account id (e.g. alice.near)"),
  executionMode: z.enum(["approval_required", "agent_auto_copy"]).default("approval_required"),
  maxUsdPerTrade: z.number().min(5).max(10_000).default(50),
  maxDailyBudgetUsd: z.number().min(5).max(50_000).default(200),
  copyScaleBps: z.number().int().min(100).max(10_000).default(1000),
  maxPriceDriftBps: z.number().int().min(10).max(1_000).default(150),
  copySpot1Click: z.boolean().default(true),
  copyVaults: z.boolean().default(true),
  copyLending: z.boolean().default(true),
  copyLp: z.boolean().default(false),
});

const patchSubscriptionSchema = z.object({
  subscriptionId: z.string().min(1),
  status: z.enum(["active", "paused", "frozen"]),
});

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: { message: "Cross-origin request refused." } }, { status: 403 });
  }
  if (rateLimited(`copy-sub:${clientKey(request)}`, { max: 20 })) {
    return NextResponse.json(
      { error: { message: "Too many copytrading updates. Wait a moment." } },
      { status: 429 },
    );
  }

  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: { message: "Sign in to configure copytrading." } }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { message: "Invalid JSON body." } }, { status: 400 });
  }

  const parsed = createSubscriptionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { message: parsed.error.issues.map((i) => i.message).join("; ") } },
      { status: 400 },
    );
  }

  const input = parsed.data;
  const prisma = getPrisma();
  const normalizedAddr =
    input.ecosystem === "solana" ? input.traderAddress : input.traderAddress.toLowerCase();

  let trader = await prisma.trackedTrader.findUnique({
    where: {
      ecosystem_address: { ecosystem: input.ecosystem, address: normalizedAddr },
    },
  });

  if (!trader) {
    const sample = SAMPLE_TOP_PERFORMERS.find(
      (s) => s.address.toLowerCase() === normalizedAddr.toLowerCase(),
    );
    trader = await prisma.trackedTrader.create({
      data: {
        address: normalizedAddr,
        ecosystem: input.ecosystem,
        resolvedHandle: sample?.resolvedHandle ?? null,
        label: sample?.label ?? `Tracked ${input.ecosystem.toUpperCase()} Trader`,
        primaryStyle: sample?.primaryStyle ?? "Spot Blue-Chips",
        realisedPnl90dUsd: sample?.realisedPnl90dUsd ?? null,
        winRatePercent: sample?.winRatePercent ?? null,
        maxDrawdownPercent: sample?.maxDrawdownPercent ?? null,
        isMemecoinFree: true,
        hasExternalHedgeWarning: sample?.hasExternalHedgeWarning ?? true,
        positionsJson: sample?.positions ?? [],
        dataMode: sample ? "sample" : "live",
      },
    });
  }

  const subscription = await prisma.copySubscription.upsert({
    where: {
      userId_trackedTraderId: {
        userId: viewer.userId,
        trackedTraderId: trader.id,
      },
    },
    update: {
      fundingNearAccountId: input.fundingNearAccountId,
      executionMode: input.executionMode,
      maxUsdPerTrade: input.maxUsdPerTrade,
      maxDailyBudgetUsd: input.maxDailyBudgetUsd,
      copyScaleBps: input.copyScaleBps,
      maxPriceDriftBps: input.maxPriceDriftBps,
      copySpot1Click: input.copySpot1Click,
      copyVaults: input.copyVaults,
      copyLending: input.copyLending,
      copyLp: input.copyLp,
      noMemecoinsOnly: true, // Non-negotiable product invariant
      status: "active",
    },
    create: {
      userId: viewer.userId,
      trackedTraderId: trader.id,
      fundingNearAccountId: input.fundingNearAccountId,
      executionMode: input.executionMode,
      maxUsdPerTrade: input.maxUsdPerTrade,
      maxDailyBudgetUsd: input.maxDailyBudgetUsd,
      copyScaleBps: input.copyScaleBps,
      maxPriceDriftBps: input.maxPriceDriftBps,
      copySpot1Click: input.copySpot1Click,
      copyVaults: input.copyVaults,
      copyLending: input.copyLending,
      copyLp: input.copyLp,
      noMemecoinsOnly: true,
      status: "active",
    },
    include: { trackedTrader: true },
  });

  const setupDescriptor = buildNearCopySetupDescriptor({
    fundingNearAccountId: input.fundingNearAccountId,
    executionMode: input.executionMode,
    maxUsdPerTrade: input.maxUsdPerTrade,
    maxDailyBudgetUsd: input.maxDailyBudgetUsd,
    maxPriceDriftBps: input.maxPriceDriftBps,
    copyLending: input.copyLending,
    copyLp: input.copyLp,
  });

  await prisma.auditEvent.create({
    data: {
      userId: viewer.userId,
      eventType: "copytrading.subscription_saved",
      actorType: "user",
      referenceId: subscription.id,
      details: {
        traderAddress: trader.address,
        fundingNearAccountId: input.fundingNearAccountId,
        executionMode: input.executionMode,
        maxUsdPerTrade: input.maxUsdPerTrade,
        maxPriceDriftBps: input.maxPriceDriftBps,
        noMemecoinsOnly: true,
      },
    },
  });

  return NextResponse.json({
    data: {
      subscription,
      setupDescriptor,
    },
  });
}

export async function PATCH(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: { message: "Cross-origin request refused." } }, { status: 403 });
  }

  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: { message: "Sign in to manage subscriptions." } }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { message: "Invalid JSON body." } }, { status: 400 });
  }

  const parsed = patchSubscriptionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { message: "Invalid subscription update." } }, { status: 400 });
  }

  const prisma = getPrisma();
  const existing = await prisma.copySubscription.findFirst({
    where: { id: parsed.data.subscriptionId, userId: viewer.userId },
  });
  if (!existing) {
    return NextResponse.json({ error: { message: "Subscription not found." } }, { status: 404 });
  }

  const updated = await prisma.copySubscription.update({
    where: { id: existing.id },
    data: { status: parsed.data.status },
    include: { trackedTrader: true },
  });

  await prisma.auditEvent.create({
    data: {
      userId: viewer.userId,
      eventType: `copytrading.subscription_${parsed.data.status}`,
      actorType: "user",
      referenceId: updated.id,
      details: { previousStatus: existing.status, newStatus: parsed.data.status },
    },
  });

  return NextResponse.json({ data: { subscription: updated } });
}
