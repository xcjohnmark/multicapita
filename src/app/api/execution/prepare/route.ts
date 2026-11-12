import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getChain } from "@/lib/chains";
import { getPrisma } from "@/lib/db/client";
import { loadGuardrails, moveBodySchema } from "@/lib/execution/api";
import { parseMoveAmount, prepareMove, balancesToJson, evaluationToJson } from "@/lib/execution/move";
import { clientKey, rateLimited } from "@/lib/http/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Prepare an executable cross-chain move.
 *
 * This is the only endpoint that can request a committed 1Click quote. It refuses unless all of
 * the following hold: live data mode, an explicit approval echoing the exact amount, and a passed
 * execution guardrail evaluation. A refusal is persisted as an audit event, because "we were
 * asked to do something unsafe and declined" is exactly what an audit log is for.
 */
export async function POST(request: Request) {
  if (rateLimited(clientKey(request), { max: 10 })) {
    return NextResponse.json(
      { error: { message: "Too many execution requests. Try again in a minute." } },
      { status: 429 },
    );
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

  if (!parsed.data.approval?.accepted) {
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

  const guardrails = await loadGuardrails();
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
  });

  const prisma = getPrisma();
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!user) {
    return NextResponse.json({ error: { message: "No user session." } }, { status: 409 });
  }

  if (!result.ok) {
    await prisma.auditEvent.create({
      data: {
        userId: user.id,
        eventType: "execution.refused",
        actorType: "system",
        details: {
          dataMode: env.APP_DATA_MODE,
          fromChainId: parsed.data.fromChainId,
          toChainId: parsed.data.toChainId,
          amountAtomic: amount.atomic.toString(),
          refusal: result.refusal,
          violations: result.evaluation.violations,
        },
      },
    });

    return NextResponse.json(
      {
        data: {
          ok: false,
          refusal: result.refusal,
          evaluation: evaluationToJson(result.evaluation),
          balances: balancesToJson(result.balances),
          dataMode: env.APP_DATA_MODE,
        },
      },
      { status: 409 },
    );
  }

  const quote = await prisma.quote.create({
    data: {
      userId: user.id,
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

  await prisma.auditEvent.create({
    data: {
      userId: user.id,
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
      },
    },
  });

  return NextResponse.json({
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
    },
    meta: {
      source: "1click committed quote",
      note: "Committed quotes expire. The deposit must land before the deadline, and it settles one leg — not atomically.",
    },
  });
}
