import { NextResponse } from "next/server";
import { z } from "zod";
import { isAddress } from "viem";
import { getViewer, viewerOwnsAddress } from "@/lib/auth/viewer";
import { NearIntentsAgentClient } from "@/lib/copytrading/agent-api";
import { COPYABLE_BLUECHIP_DEFAULTS } from "@/lib/copytrading/catalog";
import { evaluateCopyTrade } from "@/lib/copytrading/policy";
import { getPrisma } from "@/lib/db/client";
import { env } from "@/lib/env";
import { parseDecimalToAtomic } from "@/lib/finance/amounts";
import { isSameOrigin } from "@/lib/http/origin";
import { clientKey, rateLimited } from "@/lib/http/rate-limit";
import { getClient } from "@/lib/near/registry";
import { AAVE_V3_CONFIG } from "@/lib/protocols/aave";
import { UNISWAP_V3_CONFIG } from "@/lib/protocols/uniswap";

export const dynamic = "force-dynamic";

const executeCopySchema = z.object({
  subscriptionId: z.string().trim().optional(),
  actionKind: z.enum(["spot_1click", "yield_vault", "aave_lending", "uniswap_lp"]),
  targetSymbol: z.string().trim().min(1).max(32),
  targetChainId: z.number().int().default(8453),
  targetAssetId: z.string().trim().optional(),
  targetContractAddress: z.string().trim().optional(),
  leaderTradeUsd: z.number().positive().max(10_000_000),
  leaderPriceUsd: z.number().positive().nullable().default(null),
  hasBorrowOrLeverageDebt: z.boolean().default(false),
  fundingNearAccountId: z.string().trim().min(2).max(64).default("capita-user.near"),
  recipientEvmAddress: z.string().trim().optional(),
  executionMode: z.enum(["approval_required", "agent_auto_copy"]).default("approval_required"),
  maxUsdPerTrade: z.number().min(5).max(10_000).default(50),
  maxDailyBudgetUsd: z.number().min(5).max(50_000).default(200),
  copyScaleBps: z.number().int().min(100).max(10_000).default(1000),
  maxPriceDriftBps: z.number().int().min(10).max(1_000).default(150),
  slippageBps: z.number().int().min(10).max(500).default(100),
  approved: z.boolean(),
  approvedAmountUsd: z.number().positive(),
});

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: { message: "Cross-origin request refused." } }, { status: 403 });
  }
  if (rateLimited(`copy-execute:${clientKey(request)}`, { max: 10 })) {
    return NextResponse.json(
      { error: { message: "Too many copy execution requests. Wait a moment." } },
      { status: 429 },
    );
  }

  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: { message: "Sign in to execute a copy trade." } }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { message: "Invalid JSON body." } }, { status: 400 });
  }

  const parsed = executeCopySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { message: parsed.error.issues.map((i) => i.message).join("; ") } },
      { status: 400 },
    );
  }

  const input = parsed.data;
  if (env.EXECUTION_DISABLED) {
    return NextResponse.json(
      { error: { message: "Execution kill switch is enabled (EXECUTION_DISABLED)." } },
      { status: 403 },
    );
  }

  if (input.recipientEvmAddress && !viewerOwnsAddress(viewer, input.recipientEvmAddress)) {
    return NextResponse.json(
      { error: { message: "Recipient address must match your authenticated signer wallet." } },
      { status: 403 },
    );
  }

  const prisma = getPrisma();

  // Optional subscription enforcement & daily budget check
  const subscription = input.subscriptionId
    ? await prisma.copySubscription.findFirst({
        where: { id: input.subscriptionId, userId: viewer.userId },
      })
    : null;

  if (input.subscriptionId && !subscription) {
    return NextResponse.json({ error: { message: "Copy subscription not found." } }, { status: 404 });
  }

  const dailyUsedUsd = subscription?.dailyUsedUsd ?? 0;
  const maxUsdPerTrade = subscription?.maxUsdPerTrade ?? input.maxUsdPerTrade;
  const maxDailyBudgetUsd = subscription?.maxDailyBudgetUsd ?? input.maxDailyBudgetUsd;
  const copyScaleBps = subscription?.copyScaleBps ?? input.copyScaleBps;
  const maxPriceDriftBps = subscription?.maxPriceDriftBps ?? input.maxPriceDriftBps;
  const subStatus = (subscription?.status as "active" | "paused" | "frozen" | undefined) ?? "active";
  const effectiveMode =
    (subscription?.executionMode as "approval_required" | "agent_auto_copy" | undefined) ??
    input.executionMode;

  const catalogue = await getClient().getTokens();
  const matchedToken =
    (input.targetAssetId
      ? catalogue.tokens.find((t) => t.assetId === input.targetAssetId)
      : undefined) ??
    (input.targetContractAddress
      ? catalogue.tokens.find(
          (t) =>
            (t.contractAddress ?? "").toLowerCase() === input.targetContractAddress!.toLowerCase(),
        )
      : undefined) ??
    null;

  const destinationAssetId =
    matchedToken?.assetId ??
    input.targetAssetId ??
    (input.actionKind === "aave_lending" || input.actionKind === "uniswap_lp"
      ? input.targetChainId === 42161
        ? COPYABLE_BLUECHIP_DEFAULTS.arbitrumUsdcAssetId
        : COPYABLE_BLUECHIP_DEFAULTS.baseUsdcAssetId
      : undefined);

  const livePriceUsd =
    typeof matchedToken?.price === "number" && matchedToken.price > 0
      ? matchedToken.price
      : input.actionKind === "aave_lending" || input.actionKind === "uniswap_lp"
        ? 1.0
        : null;

  const evaluation = evaluateCopyTrade({
    subscriptionStatus: subStatus,
    noMemecoinsOnly: true,
    allowedActions: subscription
      ? {
          spot1Click: subscription.copySpot1Click,
          vaults: subscription.copyVaults,
          lending: subscription.copyLending,
          lp: subscription.copyLp,
        }
      : { spot1Click: true, vaults: true, lending: true, lp: true },
    actionKind: input.actionKind,
    targetSymbol: matchedToken?.symbol ?? input.targetSymbol,
    targetAssetId: destinationAssetId,
    targetContractAddress: matchedToken?.contractAddress ?? input.targetContractAddress,
    hasBorrowOrLeverageDebt: input.hasBorrowOrLeverageDebt,
    leaderTradeUsd: input.leaderTradeUsd,
    copyScaleBps,
    maxUsdPerTrade,
    maxDailyBudgetUsd,
    dailyUsedUsd,
    leaderPriceUsd: input.leaderPriceUsd,
    currentQuotePriceUsd: livePriceUsd,
    maxPriceDriftBps,
  });

  if (!evaluation.allowed) {
    await prisma.auditEvent.create({
      data: {
        userId: viewer.userId,
        eventType: "copytrading.execute_refused",
        actorType: "system",
        referenceId: subscription?.id ?? null,
        details: {
          targetSymbol: input.targetSymbol,
          actionKind: input.actionKind,
          violations: evaluation.violations,
        },
      },
    });
    return NextResponse.json(
      {
        error: {
          message:
            evaluation.violations[0]?.message ?? "Copytrade guardrail check refused execution.",
        },
        data: { ok: false, evaluation },
      },
      { status: 400 },
    );
  }

  // Explicit approval amount restatement check
  if (
    !input.approved ||
    Math.abs(input.approvedAmountUsd - evaluation.targetCopyUsd) > 0.02
  ) {
    return NextResponse.json(
      {
        error: {
          message: `Explicit approval required for exact mirror size ($${evaluation.targetCopyUsd.toFixed(2)}).`,
        },
      },
      { status: 403 },
    );
  }

  if (viewer.demo || env.APP_DATA_MODE !== "live") {
    return NextResponse.json(
      {
        error: {
          message:
            viewer.demo
              ? "Demo sessions cannot commit live copytrade deposit addresses. Connect a real wallet via SIWE."
              : `Committed copy execution requires APP_DATA_MODE="live" (currently "${env.APP_DATA_MODE}"). Use Dry Copy Quote for preview.`,
        },
      },
      { status: 403 },
    );
  }

  if (!destinationAssetId) {
    return NextResponse.json(
      {
        error: {
          message: `No live 1Click assetId resolved for ${input.targetSymbol}.`,
        },
      },
      { status: 400 },
    );
  }

  const recipientAddress =
    input.recipientEvmAddress && isAddress(input.recipientEvmAddress)
      ? input.recipientEvmAddress
      : viewer.address;

  if (!recipientAddress) {
    return NextResponse.json(
      { error: { message: "Connect an EVM wallet address to receive mirrored assets." } },
      { status: 400 },
    );
  }

  const amountAtomic = parseDecimalToAtomic(evaluation.targetCopyUsd.toFixed(2), 6).toString();

  // Mode B: Autonomous NEAR Agent API dispatch when explicitly selected
  if (effectiveMode === "agent_auto_copy") {
    const agentClient = new NearIntentsAgentClient();
    const agentRes = await agentClient.submitAgentCopyOrder({
      fundingNearAccountId: subscription?.fundingNearAccountId ?? input.fundingNearAccountId,
      destinationAsset: destinationAssetId,
      amountAtomic,
      recipientAddress,
      slippageBps: input.slippageBps,
      maxUsdPerTrade,
    });

    if (!agentRes.ok) {
      return NextResponse.json(
        { error: { message: agentRes.error ?? "NEAR Agent API dispatch failed." } },
        { status: 400 },
      );
    }

    if (subscription) {
      await prisma.copySubscription.update({
        where: { id: subscription.id },
        data: {
          dailyUsedUsd: Math.round((subscription.dailyUsedUsd + evaluation.targetCopyUsd) * 100) / 100,
        },
      });
    }

    await prisma.auditEvent.create({
      data: {
        userId: viewer.userId,
        eventType: "copytrading.agent_executed",
        actorType: "user",
        referenceId: subscription?.id ?? agentRes.orderId ?? null,
        details: {
          mode: "agent_auto_copy",
          targetSymbol: input.targetSymbol,
          amountUsd: evaluation.targetCopyUsd,
          agentOrderId: agentRes.orderId ?? null,
        },
      },
    });

    return NextResponse.json({
      ok: true,
      data: {
        mode: "mode_b_agent_api",
        orderId: agentRes.orderId ?? null,
        amountInUsdc: evaluation.targetCopyUsd,
        evaluation,
      },
    });
  }

  // Mode A: Request committed (dry: false) 1Click deposit address funded from NEAR Intents
  const deadline = new Date(Date.now() + 15 * 60_000).toISOString();
  const isNearDest = destinationAssetId.startsWith("nep141:wrap.near") || destinationAssetId.endsWith(".near");

  const committedQuote = await getClient().createQuote({
    dry: false,
    swapType: "EXACT_INPUT",
    slippageTolerance: input.slippageBps,
    originAsset: COPYABLE_BLUECHIP_DEFAULTS.nearUsdcAssetId,
    destinationAsset: destinationAssetId,
    amount: amountAtomic,
    depositType: "INTENTS",
    recipient: isNearDest
      ? (subscription?.fundingNearAccountId ?? input.fundingNearAccountId)
      : recipientAddress,
    recipientType: "DESTINATION_CHAIN",
    refundTo: subscription?.fundingNearAccountId ?? input.fundingNearAccountId,
    refundType: "INTENTS",
    deadline,
  });

  if (!committedQuote.quote.depositAddress) {
    return NextResponse.json(
      { error: { message: "1Click did not return a depositAddress for committed mirror quote." } },
      { status: 502 },
    );
  }

  const savedQuote = await prisma.quote.create({
    data: {
      userId: viewer.userId,
      provider: "1click",
      quoteReference: committedQuote.correlationId ?? null,
      originAssetId: COPYABLE_BLUECHIP_DEFAULTS.nearUsdcAssetId,
      destinationAssetId,
      originAmountAtomic: committedQuote.quote.amountIn,
      expectedOutputAtomic: committedQuote.quote.amountOut,
      minOutputAtomic: committedQuote.quote.minAmountOut ?? committedQuote.quote.amountOut,
      slippageBps: input.slippageBps,
      depositType: "INTENTS",
      chainId: input.targetChainId,
      depositAddress: committedQuote.quote.depositAddress,
      recipient: isNearDest
        ? (subscription?.fundingNearAccountId ?? input.fundingNearAccountId)
        : recipientAddress,
      recipientType: "DESTINATION_CHAIN",
      refundTo: subscription?.fundingNearAccountId ?? input.fundingNearAccountId,
      refundType: "INTENTS",
      deadline: committedQuote.quote.deadline
        ? new Date(committedQuote.quote.deadline)
        : new Date(Date.now() + 15 * 60_000),
      status: "quoted",
      rawResponse: committedQuote as unknown as object,
    },
    select: { id: true, depositAddress: true, quoteReference: true },
  });

  if (subscription) {
    await prisma.copySubscription.update({
      where: { id: subscription.id },
      data: {
        dailyUsedUsd: Math.round((subscription.dailyUsedUsd + evaluation.targetCopyUsd) * 100) / 100,
      },
    });
  }

  await prisma.auditEvent.create({
    data: {
      userId: viewer.userId,
      eventType: "copytrading.mirror_prepared",
      actorType: "user",
      referenceId: savedQuote.id,
      details: {
        mode: "mode_a_1click",
        subscriptionId: subscription?.id ?? null,
        targetSymbol: input.targetSymbol,
        actionKind: input.actionKind,
        amountUsd: evaluation.targetCopyUsd,
        depositAddress: savedQuote.depositAddress,
        correlationId: savedQuote.quoteReference,
      },
    },
  });

  const protocolFollowUp =
    input.actionKind === "aave_lending"
      ? {
          required: true,
          stepLabel: `Step 2 (Non-Atomic): Supply USDC into Aave V3 on chain ${input.targetChainId}`,
          contractAddress: (AAVE_V3_CONFIG[input.targetChainId] ?? AAVE_V3_CONFIG[8453]).poolAddress,
        }
      : input.actionKind === "uniswap_lp"
        ? {
            required: true,
            stepLabel: `Step 2 (Non-Atomic): Mint Uniswap V3 LP on chain ${input.targetChainId}`,
            contractAddress: (UNISWAP_V3_CONFIG[input.targetChainId] ?? UNISWAP_V3_CONFIG[8453])
              .positionManager,
          }
        : null;

  return NextResponse.json({
    ok: true,
    data: {
      mode: "mode_a_1click",
      quoteId: savedQuote.id,
      correlationId: savedQuote.quoteReference,
      depositAddress: savedQuote.depositAddress,
      depositMemo: committedQuote.quote.depositMemo ?? null,
      amountInUsdc: evaluation.targetCopyUsd,
      amountInAtomic: committedQuote.quote.amountIn,
      amountOutFormatted: committedQuote.quote.amountOutFormatted ?? null,
      timeEstimateSeconds: committedQuote.quote.timeEstimate ?? null,
      protocolFollowUp,
      evaluation,
    },
  });
}
