import { NextResponse } from "next/server";
import { z } from "zod";
import { proposeStrategy } from "@/lib/ai/orchestrator";
import { getViewer } from "@/lib/auth/viewer";
import { getPrisma } from "@/lib/db/client";
import { quoteCrossChainCost } from "@/lib/near/route-cost";
import { evaluateProposal } from "@/lib/policy/engine";
import { loadStrategyContext } from "@/lib/portfolio/strategy-context";
import { clientKey, rateLimited } from "@/lib/http/rate-limit";
import { isSameOrigin } from "@/lib/http/origin";
import {
  lookupIdempotency,
  readIdempotencyKey,
  requestHash,
  saveIdempotency,
} from "@/lib/http/idempotency";
import type { AiProposal, Guardrails } from "@/lib/domain/strategy";

export const dynamic = "force-dynamic";

/**
 * Propose an allocation for an objective.
 *
 * Supports plain-text natural language goals as well as interactive customized guardrails
 * and adjusted leg weights from the "Customize plan" modal.
 */

const bodySchema = z.object({
  objective: z.string().trim().min(4).max(1_000),
  guardrailOverrides: z
    .object({
      minLiquidPercent: z.number().min(0).max(100).optional(),
      maxProtocolExposurePercent: z.number().min(0).max(100).optional(),
      maxAssetExposurePercent: z.number().min(0).max(100).optional(),
      maxChainExposurePercent: z.number().min(0).max(100).optional(),
      maxStrategyExposurePercent: z.number().min(0).max(100).optional(),
      maxSlippageBps: z.number().int().min(0).max(10_000).optional(),
    })
    .optional(),
  customLegs: z
    .array(
      z.object({
        opportunityId: z.string().min(1),
        weightBps: z.number().int().min(0).max(10_000),
        rationale: z.string().optional(),
      }),
    )
    .optional(),
  deployBps: z.number().int().min(0).max(10_000).optional(),
});

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: { message: "Cross-origin request refused." } }, { status: 403 });
  }
  if (rateLimited(clientKey(request), { max: 6 })) {
    return NextResponse.json(
      { error: { message: "Too many strategy requests. Wait a minute before trying again." } },
      { status: 429 },
    );
  }

  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: { message: "Sign in to propose a strategy." } }, { status: 401 });
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

  const key = readIdempotencyKey(request);
  const hash = requestHash(parsed.data);
  if (key) {
    const lookup = await lookupIdempotency({
      userId: viewer.userId,
      scope: "strategy.propose",
      key,
      hash,
    });
    if (lookup.kind === "conflict") {
      return NextResponse.json(
        { error: { message: "This idempotency key was used for a different objective." } },
        { status: 409 },
      );
    }
    if (lookup.kind === "replay") {
      return NextResponse.json(lookup.body, {
        status: lookup.status,
        headers: { "idempotent-replay": "true" },
      });
    }
  }

  const context = await loadStrategyContext(viewer.userId);
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

  const effectiveGuardrails: Guardrails = {
    ...context.guardrails,
    ...(parsed.data.guardrailOverrides ?? {}),
  };

  let result: Awaited<ReturnType<typeof proposeStrategy>>;

  if (parsed.data.customLegs && parsed.data.customLegs.length > 0) {
    const now = new Date();
    const customProposal: AiProposal = {
      strategyName: "Custom User Strategy",
      category: "balanced",
      summary: "Custom user allocation evaluated by the deterministic policy engine.",
      howItWorks: [
        "User-defined custom allocation weights.",
        `Enforces ${effectiveGuardrails.minLiquidPercent}% minimum liquid wallet reserve.`,
        `Subject to ${effectiveGuardrails.maxProtocolExposurePercent}% protocol exposure limits.`,
        "Verified by deterministic guardrail rules before execution.",
      ],
      targetApy: 0,
      decisionPoints: ["Manual user customized weights."],
      objectiveSummary: parsed.data.objective,
      legs: parsed.data.customLegs.map((l) => ({
        opportunityId: l.opportunityId,
        weightBps: l.weightBps,
        rationale: l.rationale ?? "User customized allocation weight.",
      })),
      deployBps: parsed.data.deployBps ?? 10_000,
      riskNotes: [],
      requiresUserInput: [],
    };

    let weightedApySum = 0;
    const oppMap = new Map(context.opportunities.map((o) => [o.id, o]));
    for (const leg of customProposal.legs) {
      const opp = oppMap.get(leg.opportunityId);
      const rate = opp?.expectedRatePercent ?? 0;
      weightedApySum += (rate * leg.weightBps) / 10_000;
    }
    customProposal.targetApy = Math.round(weightedApySum * 100) / 100;

    const evaluation = evaluateProposal({
      proposal: customProposal,
      guardrails: effectiveGuardrails,
      opportunities: context.opportunities,
      portfolio: context.portfolio,
      now,
    });

    result = {
      source: "deterministic_fallback",
      modelId: "user-customized",
      proposal: customProposal,
      evaluation,
      trace: [
        {
          step: "validation",
          detail: `Custom plan accepted: ${customProposal.legs.length} leg(s).`,
        },
        {
          step: "policy",
          detail: evaluation.ok
            ? "Policy engine passed all guardrails."
            : "Policy engine flagged violations.",
        },
      ],
      warnings: evaluation.ok ? [] : ["The custom plan has policy violations; see violations."],
    };
  } else {
    result = await proposeStrategy({
      objective: parsed.data.objective,
      guardrails: effectiveGuardrails,
      opportunities: context.opportunities,
      portfolio: context.portfolio,
      routeCost: quoteCrossChainCost,
    });
  }

  const prisma = getPrisma();
  const protocols = await prisma.protocol.findMany({ select: { id: true, slug: true } });
  const protocolIdBySlug = new Map(protocols.map((protocol) => [protocol.slug, protocol.id]));

  const errors = result.evaluation.violations.filter((violation) => violation.severity === "error");

  const persisted = await prisma.strategyProposal.create({
    data: {
      userId: viewer.userId,
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
      userId: viewer.userId,
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
        demoSession: viewer.demo,
      },
    },
  });

  const body = {
    data: {
      id: persisted.id,
      createdAt: persisted.createdAt.toISOString(),
      source: result.source,
      modelId: result.modelId,
      strategyName: result.proposal.strategyName,
      category: result.proposal.category,
      summary: result.proposal.summary,
      howItWorks: result.proposal.howItWorks,
      targetApy: result.proposal.targetApy,
      decisionPoints: result.proposal.decisionPoints,
      proposal: result.proposal,
      evaluation: result.evaluation,
      trace: result.trace,
      warnings: result.warnings,
      guardrails: effectiveGuardrails,
      portfolio: context.target,
      dataMode: context.dataMode,
      demoSession: viewer.demo,
      aiConfigured: result.source === "model",
    },
  };

  if (key) {
    await saveIdempotency({
      userId: viewer.userId,
      scope: "strategy.propose",
      key,
      hash,
      response: { status: 200, body },
    });
  }

  return NextResponse.json(body);
}
