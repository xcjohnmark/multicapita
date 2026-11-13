import { NextResponse } from "next/server";
import { z } from "zod";
import { isAddress } from "viem";
import { getViewer } from "@/lib/auth/viewer";
import { buildNearCopySetupDescriptor } from "@/lib/copytrading/agent-api";
import { COPYABLE_BLUECHIP_DEFAULTS } from "@/lib/copytrading/catalog";
import { evaluateCopyTrade } from "@/lib/copytrading/policy";
import { getPrisma } from "@/lib/db/client";
import { parseDecimalToAtomic } from "@/lib/finance/amounts";
import { isSameOrigin } from "@/lib/http/origin";
import { clientKey, rateLimited } from "@/lib/http/rate-limit";
import { getClient } from "@/lib/near/registry";
import { AAVE_V3_CONFIG } from "@/lib/protocols/aave";
import { UNISWAP_V3_CONFIG } from "@/lib/protocols/uniswap";

export const dynamic = "force-dynamic";

const copyQuoteSchema = z.object({
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
  maxUsdPerTrade: z.number().min(5).max(10_000).default(50),
  maxDailyBudgetUsd: z.number().min(5).max(50_000).default(200),
  dailyUsedUsd: z.number().min(0).default(0),
  copyScaleBps: z.number().int().min(100).max(10_000).default(1000),
  maxPriceDriftBps: z.number().int().min(10).max(1_000).default(150),
  slippageBps: z.number().int().min(10).max(500).default(100),
});

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: { message: "Cross-origin request refused." } }, { status: 403 });
  }
  if (rateLimited(`copy-quote:${clientKey(request)}`, { max: 20 })) {
    return NextResponse.json(
      { error: { message: "Too many copytrading quote requests. Wait a moment." } },
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

  const parsed = copyQuoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { message: parsed.error.issues.map((i) => i.message).join("; ") } },
      { status: 400 },
    );
  }

  const input = parsed.data;
  const prisma = getPrisma();

  // 1. Resolve live token catalogue price & verified assetId
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

  // 2. Deterministic Copytrading Policy Shield BEFORE any external quote request
  const preEvaluation = evaluateCopyTrade({
    subscriptionStatus: "active",
    noMemecoinsOnly: true,
    allowedActions: {
      spot1Click: true,
      vaults: true,
      lending: true,
      lp: true,
    },
    actionKind: input.actionKind,
    targetSymbol: matchedToken?.symbol ?? input.targetSymbol,
    targetAssetId: destinationAssetId,
    targetContractAddress: matchedToken?.contractAddress ?? input.targetContractAddress,
    hasBorrowOrLeverageDebt: input.hasBorrowOrLeverageDebt,
    leaderTradeUsd: input.leaderTradeUsd,
    copyScaleBps: input.copyScaleBps,
    maxUsdPerTrade: input.maxUsdPerTrade,
    maxDailyBudgetUsd: input.maxDailyBudgetUsd,
    dailyUsedUsd: input.dailyUsedUsd,
    leaderPriceUsd: input.leaderPriceUsd,
    currentQuotePriceUsd: livePriceUsd,
    maxPriceDriftBps: input.maxPriceDriftBps,
  });

  if (!preEvaluation.allowed) {
    await prisma.auditEvent.create({
      data: {
        userId: viewer?.userId ?? null,
        eventType: "copytrading.policy_blocked",
        actorType: "system",
        details: {
          targetSymbol: input.targetSymbol,
          actionKind: input.actionKind,
          violations: preEvaluation.violations,
        },
      },
    });

    return NextResponse.json({
      data: {
        allowed: false,
        evaluation: preEvaluation,
        quote: null,
        protocolFollowUp: null,
      },
    });
  }

  if (!destinationAssetId) {
    return NextResponse.json(
      {
        error: {
          message: `No live 1Click assetId found for ${input.targetSymbol}; cannot quote cross-chain leg safely.`,
        },
      },
      { status: 400 },
    );
  }

  // 3. Request live DRY preview quote (`dry: true` always, funded from NEAR USDC)
  const recipientAddress =
    input.recipientEvmAddress && isAddress(input.recipientEvmAddress)
      ? input.recipientEvmAddress
      : viewer?.address && isAddress(viewer.address)
        ? viewer.address
        : "0x000000000000000000000000000000000000dead";

  const amountAtomic = parseDecimalToAtomic(preEvaluation.targetCopyUsd.toFixed(2), 6).toString();
  const deadline = new Date(Date.now() + 15 * 60_000).toISOString();

  const isOneClickDirect =
    input.actionKind === "spot_1click" || input.actionKind === "yield_vault";

  const dryQuote = await getClient().createQuote({
    dry: true, // Preview only: never allocates a deposit address here
    swapType: "EXACT_INPUT",
    slippageTolerance: input.slippageBps,
    originAsset: COPYABLE_BLUECHIP_DEFAULTS.nearUsdcAssetId,
    destinationAsset: destinationAssetId,
    amount: amountAtomic,
    depositType: "INTENTS",
    recipient:
      isOneClickDirect && destinationAssetId.startsWith("nep141:wrap.near")
        ? input.fundingNearAccountId
        : recipientAddress,
    recipientType: "DESTINATION_CHAIN",
    refundTo: input.fundingNearAccountId,
    refundType: "INTENTS",
    deadline,
  });

  // 4. Attach destination protocol instruction summary for two-step Aave/Uniswap mirrors
  const setupDescriptor = buildNearCopySetupDescriptor({
    fundingNearAccountId: input.fundingNearAccountId,
    executionMode: "approval_required",
    maxUsdPerTrade: input.maxUsdPerTrade,
    maxDailyBudgetUsd: input.maxDailyBudgetUsd,
    maxPriceDriftBps: input.maxPriceDriftBps,
    copyLending: input.actionKind === "aave_lending",
    copyLp: input.actionKind === "uniswap_lp",
  });

  let protocolFollowUp: {
    required: boolean;
    stepLabel: string;
    contractAddress: string;
    signerMechanism: string;
  } | null = null;

  if (input.actionKind === "aave_lending") {
    const aaveCfg = AAVE_V3_CONFIG[input.targetChainId] ?? AAVE_V3_CONFIG[8453];
    protocolFollowUp = {
      required: true,
      stepLabel: `Step 2: Call Aave V3 supply() on ${aaveCfg.name} once 1Click delivers USDC`,
      contractAddress: aaveCfg.poolAddress,
      signerMechanism: "Connected Wallet or NEAR Chain Signatures (v1.signer)",
    };
  } else if (input.actionKind === "uniswap_lp") {
    const uniCfg = UNISWAP_V3_CONFIG[input.targetChainId] ?? UNISWAP_V3_CONFIG[8453];
    protocolFollowUp = {
      required: true,
      stepLabel: `Step 2: Call Uniswap V3 mint() on ${uniCfg.name} once 1Click delivers USDC`,
      contractAddress: uniCfg.positionManager,
      signerMechanism: "Connected Wallet or NEAR Chain Signatures (v1.signer)",
    };
  }

  return NextResponse.json({
    data: {
      allowed: true,
      evaluation: preEvaluation,
      quote: {
        dry: true,
        correlationId: dryQuote.correlationId,
        originAsset: COPYABLE_BLUECHIP_DEFAULTS.nearUsdcAssetId,
        destinationAsset: destinationAssetId,
        amountInUsdc: preEvaluation.targetCopyUsd,
        amountInAtomic: dryQuote.quote.amountIn,
        amountOutAtomic: dryQuote.quote.amountOut,
        amountOutFormatted: dryQuote.quote.amountOutFormatted ?? null,
        amountOutUsd: dryQuote.quote.amountOutUsd ?? null,
        timeEstimateSeconds: dryQuote.quote.timeEstimate ?? null,
      },
      protocolFollowUp,
      nearSetup: setupDescriptor,
    },
  });
}
