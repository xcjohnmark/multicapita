import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getChain } from "@/lib/chains";
import { getViewer, viewerOwnsAddress } from "@/lib/auth/viewer";
import { getPrisma } from "@/lib/db/client";
import { loadGuardrails, moveBodySchema } from "@/lib/execution/api";
import { loadExecutionLimits } from "@/lib/execution/limits";
import { parseMoveAmount, prepareMove, balancesToJson, evaluationToJson } from "@/lib/execution/move";
import { clientKey, rateLimited } from "@/lib/http/rate-limit";
import { isSameOrigin } from "@/lib/http/origin";
import {
  lookupIdempotency,
  readIdempotencyKey,
  requestHash,
  saveIdempotency,
} from "@/lib/http/idempotency";

export const dynamic = "force-dynamic";

/**
 * Prepare an executable cross-chain move.
 *
 * This is the only endpoint that can request a committed 1Click quote. It refuses unless all of
 * the following hold: a signed-in session that owns the wallet, live data mode, the kill switch is
 * off, the amount is inside the per-transaction and 24-hour caps, an explicit approval echoes the
 * exact amount, and the execution guardrails pass. A refusal is persisted as an audit event,
 * because "we were asked to do something unsafe and declined" is exactly what an audit log is for.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: { message: "Cross-origin request refused." } }, { status: 403 });
  }
  if (rateLimited(clientKey(request), { max: 10 })) {
    return NextResponse.json(
      { error: { message: "Too many execution requests. Try again in a minute." } },
      { status: 429 },
    );
  }

  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: { message: "Sign in to prepare a move." } }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: { message: "Invalid JSON body" } }, { status: 400 });
  }

  const parsed = moveBodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          message: "Invalid move request.",
          fields: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
      },
      { status: 400 },
    );
  }

  if (!viewerOwnsAddress(viewer, parsed.data.walletAddress)) {
    return NextResponse.json(
      {
        error: {
          message:
            "The connected wallet is not the wallet this session signed in with. Sign in again with the wallet you intend to move funds from.",
        },
      },
      { status: 403 },
    );
  }

  const decimals = getChain(parsed.data.fromChainId)?.usdc.decimals ?? 6;
  const amount = parseMoveAmount(parsed.data.amount, decimals);
  const approved = parsed.data.approval
    ? parseMoveAmount(parsed.data.approval.amount, decimals)
    : null;
  if (!amount || !approved) {
    return NextResponse.json(
      { error: { message: "Amount could not be converted exactly to atomic units." } },
      { status: 400 },
    );
  }

  if (!parsed.data.approval?.accepted || approved.atomic !== amount.atomic) {
    return NextResponse.json(
      {
        error: {
          message:
            "Execution requires an explicit approval that restates the exact amount. A policy pass is not an approval.",
        },
      },
      { status: 403 },
    );
  }

  const idempotencyKey = readIdempotencyKey(request);
  const hash = requestHash(parsed.data);
  if (idempotencyKey) {
    const lookup = await lookupIdempotency({
      userId: viewer.userId,
      scope: "execution.prepare",
      key: idempotencyKey,
      hash,
    });
    if (lookup.kind === "conflict") {
      return NextResponse.json(
        { error: { message: "This idempotency key was used for a different move." } },
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

  const [guardrails, limits] = await Promise.all([
    loadGuardrails(viewer.userId),
    loadExecutionLimits({ userId: viewer.userId, decimals }),
  ]);

  const result = await prepareMove({
    fromChainId: parsed.data.fromChainId,
    toChainId: parsed.data.toChainId,
    amountAtomic: amount.atomic,
    approvedAmountAtomic: approved.atomic,
    walletAddress: parsed.data.walletAddress,
    guardrails,
    explicitApproval: true,
    decimals,
    dataMode: env.APP_DATA_MODE,
    disabledReason: limits.disabledReason,
    maxMoveAtomic: limits.maxMoveAtomic,
    maxDailyAtomic: limits.maxDailyAtomic,
    dailyUsedAtomic: limits.dailyUsedAtomic,
  });

  const prisma = getPrisma();

  if (!result.ok) {
    await prisma.auditEvent.create({
      data: {
        userId: viewer.userId,
        eventType: "execution.refused",
        actorType: "system",
        details: {
          dataMode: env.APP_DATA_MODE,
          fromChainId: parsed.data.fromChainId,
          toChainId: parsed.data.toChainId,
          amountAtomic: amount.atomic.toString(),
          refusal: result.refusal,
          violations: result.evaluation.violations,
          walletAddress: parsed.data.walletAddress,
          demoSession: viewer.demo,
        },
      },
    });

    const body = {
      data: {
        ok: false,
        refusal: result.refusal,
        evaluation: evaluationToJson(result.evaluation),
        balances: balancesToJson(result.balances),
        dataMode: env.APP_DATA_MODE,
        limits: {
          maxMoveAtomic: limits.maxMoveAtomic.toString(),
          maxDailyAtomic: limits.maxDailyAtomic.toString(),
          dailyUsedAtomic: limits.dailyUsedAtomic.toString(),
        },
      },
    };

    if (idempotencyKey) {
      await saveIdempotency({
        userId: viewer.userId,
        scope: "execution.prepare",
        key: idempotencyKey,
        hash,
        response: { status: 409, body },
      });
    }

    return NextResponse.json(body, { status: 409 });
  }

  const quote = await prisma.quote.create({
    data: {
      userId: viewer.userId,
      provider: "1click",
      quoteReference: result.quote.correlationId,
      originAssetId: result.origin.assetId,
      destinationAssetId: result.destination.assetId,
      originAmountAtomic: result.quote.quote.amountIn,
      expectedOutputAtomic: result.quote.quote.amountOut,
      minOutputAtomic: result.quote.quote.minAmountOut ?? null,
      slippageBps: Math.min(guardrails.maxSlippageBps, 100),
      depositType: "ORIGIN_CHAIN",
      chainId: parsed.data.fromChainId,
      depositAddress: result.instruction.to,
      recipient: parsed.data.walletAddress,
      recipientType: "DESTINATION_CHAIN",
      refundTo: parsed.data.walletAddress,
      refundType: "ORIGIN_CHAIN",
      feeBreakdown: {
        previewViolations: result.previewEvaluation.violations,
        chainErrors: result.balances.errors,
      },
      rawResponse: result.quote.quote,
      signature: result.quote.signature ?? null,
      deadline: result.quote.quote.deadline ? new Date(result.quote.quote.deadline) : null,
      status: "quoted",
    },
    select: { id: true, createdAt: true },
  });

  await prisma.quoteStatusEvent.create({
    data: {
      quoteId: quote.id,
      providerStatus: "QUOTED",
      localStatus: "quoted",
      raw: { correlationId: result.quote.correlationId },
    },
  });

  await prisma.auditEvent.create({
    data: {
      userId: viewer.userId,
      eventType: "execution.prepared",
      actorType: "user",
      referenceId: quote.id,
      details: {
        fromChainId: parsed.data.fromChainId,
        toChainId: parsed.data.toChainId,
        amountAtomic: amount.atomic.toString(),
        depositAddress: result.instruction.to,
        correlationId: result.quote.correlationId,
        deadline: result.quote.quote.deadline,
        minimumOutputAtomic: result.evaluation.minimumOutputAtomic.toString(),
        walletAddress: parsed.data.walletAddress,
      },
    },
  });

  const body = {
    data: {
      ok: true,
      quoteId: quote.id,
      createdAt: quote.createdAt.toISOString(),
      instruction: {
        chainId: result.instruction.chainId,
        to: result.instruction.to,
        data: result.instruction.data,
        value: result.instruction.value.toString(),
        amountAtomic: result.instruction.amountAtomic,
        tokenAddress: result.instruction.tokenAddress,
        tokenSymbol: result.instruction.tokenSymbol,
        explorerUrl: result.instruction.explorerUrl,
      },
      quote: {
        correlationId: result.quote.correlationId,
        amountIn: result.quote.quote.amountIn,
        amountOut: result.quote.quote.amountOut,
        minAmountOut: result.quote.quote.minAmountOut ?? null,
        deadline: result.quote.quote.deadline ?? null,
      },
      evaluation: evaluationToJson(result.evaluation),
      balances: balancesToJson(result.balances),
      dataMode: env.APP_DATA_MODE,
      limits: {
        maxMoveAtomic: limits.maxMoveAtomic.toString(),
        maxDailyAtomic: limits.maxDailyAtomic.toString(),
        dailyUsedAtomic: limits.dailyUsedAtomic.toString(),
      },
    },
    meta: {
      source: "1click committed quote",
      note: "Committed quotes expire. The deposit must land before the deadline, and it settles one leg — not atomically.",
    },
  };

  if (idempotencyKey) {
    await saveIdempotency({
      userId: viewer.userId,
      scope: "execution.prepare",
      key: idempotencyKey,
      hash,
      response: { status: 200, body },
    });
  }

  return NextResponse.json(body);
}
