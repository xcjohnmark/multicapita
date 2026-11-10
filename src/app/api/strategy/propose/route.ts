import { NextResponse } from "next/server";
import { z } from "zod";
import { proposeStrategy } from "@/lib/ai/orchestrator";
import { getPrisma } from "@/lib/db/client";
import { quoteCrossChainCost } from "@/lib/near/route-cost";
import { loadStrategyContext } from "@/lib/portfolio/strategy-context";

export const dynamic = "force-dynamic";

/**
 * Propose an allocation for an objective.
 *
 * The response always contains a policy verdict. A proposal that fails the policy engine is
 * persisted *and returned* with its violations rather than being discarded — the rejection is
 * part of the audit trail, and hiding it would make the guardrails unobservable.
 */

const bodySchema = z.object({
  objective: z.string().trim().min(8).max(1_000),
});

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 6;
const hits = new Map<string, number[]>();

function rateLimited(key: string, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 1_000) hits.clear();
  return recent.length > MAX_REQUESTS;
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: { message: "Too many strategy requests. Wait a minute before trying again." } },
      { status: 429 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: { message: "Invalid JSON body" } }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          message: "Describe your objective in a short sentence.",
          fields: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
      },
      { status: 400 },
    );
  }

  const context = await loadStrategyContext();
  if (!context) {
    return NextResponse.json(
      {
        error: {
          message:
            "No portfolio found. Run `npx prisma migrate dev` and `npm run db:seed` to create the sample portfolio.",
        },
      },
      { status: 409 },
    );
  }

  if (context.opportunities.length === 0) {
    return NextResponse.json(
      { error: { message: "No opportunities available to plan against." } },
      { status: 409 },
    );
  }

  const result = await proposeStrategy({
    objective: parsed.data.objective,
    guardrails: context.guardrails,
    opportunities: context.opportunities,
    portfolio: context.portfolio,
    routeCost: quoteCrossChainCost,
  });

  const prisma = getPrisma();
  const protocols = await prisma.protocol.findMany({ select: { id: true, slug: true } });
  const protocolIdBySlug = new Map(protocols.map((protocol) => [protocol.slug, protocol.id]));

  const errors = result.evaluation.violations.filter((violation) => violation.severity === "error");

  const persisted = await prisma.strategyProposal.create({
    data: {
      userId: context.userId,
      strategyProfileId: context.profileId,
      modelId: result.modelId ?? "deterministic-planner",
      objectiveSummary: result.proposal.objectiveSummary,
      proposalJson: {
        ...result.proposal,
        objectiveInput: parsed.data.objective,
        source: result.source,
      },
      validationStatus: result.evaluation.ok ? "validated" : "rejected",
      validationErrors: result.evaluation.violations,
      status: "open",
      expiresAt: new Date(Date.now() + 60 * 60_000),
      allocations: {
        create: result.evaluation.legs.map((leg) => ({
          opportunityId: leg.opportunityId,
          strategyType: leg.strategyType,
          chainId: leg.chainId,
          protocolId: protocolIdBySlug.get(leg.protocolSlug) ?? protocols[0]?.id,
          // Atomic amounts are only knowable once a quote exists. The USD estimate is what the
          // plan actually decided; storing a fake atomic amount would be a lie.
          amountAtomic: "0",
          amountUsdEstimate: leg.amountUsd,
          rationale: leg.rationale,
          executionStatus: "planned",
        })),
      },
    },
    select: { id: true, createdAt: true },
  });

  await prisma.auditEvent.create({
    data: {
      userId: context.userId,
      eventType: "strategy.proposed",
      actorType: result.source === "model" ? "ai" : "system",
      referenceId: persisted.id,
      details: {
        source: result.source,
        modelId: result.modelId,
        objective: parsed.data.objective,
        validationStatus: result.evaluation.ok ? "validated" : "rejected",
        errorCount: errors.length,
        allocatedUsd: result.evaluation.totals.allocatedUsd,
        reserveUsd: result.evaluation.totals.reserveUsd,
      },
    },
  });

  return NextResponse.json({
    data: {
      id: persisted.id,
      createdAt: persisted.createdAt.toISOString(),
      source: result.source,
      modelId: result.modelId,
      proposal: result.proposal,
      evaluation: result.evaluation,
      trace: result.trace,
      warnings: result.warnings,
      guardrails: context.guardrails,
      portfolio: context.target,
      dataMode: context.dataMode,
      aiConfigured: result.source === "model",
    },
  });
}
