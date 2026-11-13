import { NextResponse } from "next/server";
import { z } from "zod";
import { getViewer } from "@/lib/auth/viewer";
import { getPrisma } from "@/lib/db/client";
import { guardrailsSchema } from "@/lib/domain/strategy";
import { isSameOrigin } from "@/lib/http/origin";
import { clientKey, rateLimited } from "@/lib/http/rate-limit";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  minLiquidPercent: z.number().min(0).max(100).optional(),
  maxProtocolExposurePercent: z.number().min(0).max(100).optional(),
  maxAssetExposurePercent: z.number().min(0).max(100).optional(),
  maxChainExposurePercent: z.number().min(0).max(100).optional(),
  maxStrategyExposurePercent: z.number().min(0).max(100).optional(),
  maxSlippageBps: z.number().int().min(0).max(10_000).optional(),
  maxGasUsd: z.number().min(0).max(1_000).optional(),
  minArbitrageProfitUsd: z.number().min(0).max(10_000).optional(),
});

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: { message: "Cross-origin request refused." } }, { status: 403 });
  }
  if (rateLimited(`strategy-constraints:${clientKey(request)}`, { max: 20 })) {
    return NextResponse.json(
      { error: { message: "Too many guardrail updates. Try again in a moment." } },
      { status: 429 },
    );
  }

  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: { message: "Sign in to update guardrails." } }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { message: "Invalid JSON body." } }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { message: "Invalid guardrail values.", fields: parsed.error.issues } },
      { status: 400 },
    );
  }

  const prisma = getPrisma();

  let profile = await prisma.strategyProfile.findFirst({
    where: { userId: viewer.userId, isActive: true },
    include: { constraints: true },
    orderBy: { createdAt: "asc" },
  });

  if (!profile) {
    profile = await prisma.strategyProfile.create({
      data: {
        userId: viewer.userId,
        name: "Default Portfolio Guardrails",
        objective: "Capital-preserving cross-chain yield and execution rules",
        isActive: true,
      },
      include: { constraints: true },
    });
  }

  const existing = profile.constraints;
  const merged = guardrailsSchema.parse({
    minLiquidPercent: parsed.data.minLiquidPercent ?? existing?.minLiquidPercent ?? 30,
    maxProtocolExposurePercent:
      parsed.data.maxProtocolExposurePercent ?? existing?.maxProtocolExposurePercent ?? 40,
    maxAssetExposurePercent:
      parsed.data.maxAssetExposurePercent ?? existing?.maxAssetExposurePercent ?? 60,
    maxChainExposurePercent:
      parsed.data.maxChainExposurePercent ?? existing?.maxChainExposurePercent ?? 70,
    maxStrategyExposurePercent:
      parsed.data.maxStrategyExposurePercent ?? existing?.maxStrategyExposurePercent ?? 60,
    maxSlippageBps: parsed.data.maxSlippageBps ?? existing?.maxSlippageBps ?? 50,
    maxGasUsd: parsed.data.maxGasUsd ?? existing?.maxGasUsd ?? 15,
    minArbitrageProfitUsd:
      parsed.data.minArbitrageProfitUsd ?? existing?.minArbitrageProfitUsd ?? 5,
    approvedChainIds: null,
    approvedProtocols: null,
    requiresUserApproval: existing?.requiresUserApproval ?? true,
  });

  await prisma.strategyConstraint.upsert({
    where: { strategyProfileId: profile.id },
    create: {
      strategyProfileId: profile.id,
      minLiquidPercent: merged.minLiquidPercent,
      maxProtocolExposurePercent: merged.maxProtocolExposurePercent,
      maxAssetExposurePercent: merged.maxAssetExposurePercent,
      maxChainExposurePercent: merged.maxChainExposurePercent,
      maxStrategyExposurePercent: merged.maxStrategyExposurePercent,
      maxSlippageBps: merged.maxSlippageBps,
      maxGasUsd: merged.maxGasUsd,
      minArbitrageProfitUsd: merged.minArbitrageProfitUsd,
      requiresUserApproval: merged.requiresUserApproval,
    },
    update: {
      minLiquidPercent: merged.minLiquidPercent,
      maxProtocolExposurePercent: merged.maxProtocolExposurePercent,
      maxAssetExposurePercent: merged.maxAssetExposurePercent,
      maxChainExposurePercent: merged.maxChainExposurePercent,
      maxStrategyExposurePercent: merged.maxStrategyExposurePercent,
      maxSlippageBps: merged.maxSlippageBps,
      maxGasUsd: merged.maxGasUsd,
      minArbitrageProfitUsd: merged.minArbitrageProfitUsd,
    },
  });

  await prisma.auditEvent.create({
    data: {
      userId: viewer.userId,
      eventType: "strategy.constraints_updated",
      actorType: "user",
      referenceId: profile.id,
      details: {
        minLiquidPercent: merged.minLiquidPercent,
        maxProtocolExposurePercent: merged.maxProtocolExposurePercent,
        maxChainExposurePercent: merged.maxChainExposurePercent,
        maxStrategyExposurePercent: merged.maxStrategyExposurePercent,
      },
    },
  });

  return NextResponse.json({
    ok: true,
    data: {
      profileId: profile.id,
      guardrails: merged,
    },
  });
}
