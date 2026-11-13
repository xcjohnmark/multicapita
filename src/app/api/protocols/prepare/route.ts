import { NextResponse } from "next/server";
import { z } from "zod";
import { getViewer } from "@/lib/auth/viewer";
import { isSameOrigin } from "@/lib/http/origin";
import { clientKey, rateLimited } from "@/lib/http/rate-limit";
import {
  AAVE_V3_CONFIG,
  getAaveAllowance,
  prepareAaveApprove,
  prepareAaveSupply,
  prepareAaveWithdraw,
} from "@/lib/protocols/aave";
import {
  computeStablecoinTickRange,
  getUniswapAllowance,
  prepareUniswapApprove,
  prepareUniswapCollect,
  prepareUniswapMint,
  UNISWAP_V3_CONFIG,
  UNISWAP_V3_PAIRS,
} from "@/lib/protocols/uniswap";
import {
  evaluateEquityPriceProvenance,
  fetchLiveEquityDualQuote,
  getEquityAllowance,
  getVerifiedEquityAsset,
  prepareEquityApprove,
  prepareEquitySwap,
} from "@/lib/protocols/equities";
import type { Address } from "viem";

export const dynamic = "force-dynamic";

const prepareSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("aave_supply"),
    chainId: z.number().int(),
    amountAtomic: z.string().regex(/^\d+$/),
  }),
  z.object({
    action: z.literal("aave_withdraw"),
    chainId: z.number().int(),
    amountAtomic: z.string().regex(/^\d+$/),
  }),
  z.object({
    action: z.literal("uniswap_mint"),
    chainId: z.number().int(),
    token0: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
    token1: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
    feeTier: z.number().int().default(100),
    amount0DesiredAtomic: z.string().regex(/^\d+$/),
    amount1DesiredAtomic: z.string().regex(/^\d+$/),
  }),
  z.object({
    action: z.literal("uniswap_collect"),
    chainId: z.number().int(),
    tokenId: z.string().regex(/^\d+$/),
  }),
  z.object({
    action: z.literal("equity_swap"),
    chainId: z.number().int(),
    contractAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    direction: z.enum(["buy", "sell"]).default("buy"),
    amountAtomic: z.string().regex(/^\d+$/),
    maxNavDeviationBps: z.number().int().min(10).max(2000).default(150),
    allowOffHoursExecution: z.boolean().default(false),
    slippageBps: z.number().int().min(10).max(500).default(100),
  }),
]);

function serializeInstruction<T extends { value: bigint }>(inst: T) {
  return {
    ...inst,
    value: inst.value.toString(),
  };
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: { message: "Cross-origin request refused." } }, { status: 403 });
  }
  if (rateLimited(`protocols-prepare:${clientKey(request)}`, { max: 20 })) {
    return NextResponse.json(
      { error: { message: "Too many protocol requests. Please wait a minute." } },
      { status: 429 },
    );
  }

  const viewer = await getViewer();
  if (!viewer || !viewer.address) {
    return NextResponse.json({ error: { message: "Sign in to prepare protocol interactions." } }, { status: 401 });
  }

  const userAddress = viewer.address.toLowerCase() as Address;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { message: "Invalid JSON body" } }, { status: 400 });
  }

  const parsed = prepareSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          message: "Invalid protocol operation parameters.",
          issues: parsed.error.issues,
        },
      },
      { status: 400 },
    );
  }

  const req = parsed.data;

  // 1. Aave Supply
  if (req.action === "aave_supply") {
    const config = AAVE_V3_CONFIG[req.chainId];
    if (!config) {
      return NextResponse.json({ error: { message: `Unsupported chain ${req.chainId} for Aave V3` } }, { status: 400 });
    }

    const amount = BigInt(req.amountAtomic);
    try {
      const currentAllowance = await getAaveAllowance({
        chainId: req.chainId,
        assetAddress: config.usdcAddress,
        ownerAddress: userAddress,
      });

      if (currentAllowance < amount) {
        const approveInst = prepareAaveApprove({
          chainId: req.chainId,
          assetAddress: config.usdcAddress,
          amountAtomic: amount,
        });

        return NextResponse.json({
          data: {
            step: 1,
            totalSteps: 2,
            stepName: "Approve Aave Pool",
            requiresApproval: true,
            instruction: serializeInstruction(approveInst),
            note: "First transaction approves Aave V3 Pool to spend your USDC. Once confirmed, proceed to Supply.",
          },
        });
      }

      const supplyInst = prepareAaveSupply({
        chainId: req.chainId,
        assetAddress: config.usdcAddress,
        amountAtomic: amount,
        onBehalfOf: userAddress,
      });

      return NextResponse.json({
        data: {
          step: 2,
          totalSteps: 2,
          stepName: "Supply to Aave V3",
          requiresApproval: false,
          instruction: serializeInstruction(supplyInst),
          note: "Deposit USDC into Aave V3 to receive yield-bearing aTokens.",
        },
      });
    } catch (err) {
      return NextResponse.json(
        { error: { message: (err as Error).message ?? "Failed to prepare Aave supply" } },
        { status: 500 },
      );
    }
  }

  // 2. Aave Withdraw
  if (req.action === "aave_withdraw") {
    const config = AAVE_V3_CONFIG[req.chainId];
    if (!config) {
      return NextResponse.json({ error: { message: `Unsupported chain ${req.chainId} for Aave V3` } }, { status: 400 });
    }

    const amount = BigInt(req.amountAtomic);
    try {
      const withdrawInst = prepareAaveWithdraw({
        chainId: req.chainId,
        assetAddress: config.usdcAddress,
        amountAtomic: amount,
        to: userAddress,
      });

      return NextResponse.json({
        data: {
          step: 1,
          totalSteps: 1,
          stepName: "Withdraw from Aave V3",
          requiresApproval: false,
          instruction: serializeInstruction(withdrawInst),
          note: "Burn aTokens to withdraw underlying USDC directly back to your connected wallet.",
        },
      });
    } catch (err) {
      return NextResponse.json(
        { error: { message: (err as Error).message ?? "Failed to prepare Aave withdrawal" } },
        { status: 500 },
      );
    }
  }

  // 3. Uniswap Mint LP (checks token0 & token1 allowances before mint)
  if (req.action === "uniswap_mint") {
    const config = UNISWAP_V3_CONFIG[req.chainId];
    const defaultPair = UNISWAP_V3_PAIRS[req.chainId];
    if (!config || !defaultPair) {
      return NextResponse.json({ error: { message: `Unsupported chain ${req.chainId} for Uniswap V3` } }, { status: 400 });
    }

    const token0 = (req.token0 ?? defaultPair.token0) as Address;
    const token1 = (req.token1 ?? defaultPair.token1) as Address;
    const amount0 = BigInt(req.amount0DesiredAtomic);
    const amount1 = BigInt(req.amount1DesiredAtomic);

    try {
      const [allow0, allow1] = await Promise.all([
        getUniswapAllowance({ chainId: req.chainId, tokenAddress: token0, ownerAddress: userAddress }),
        getUniswapAllowance({ chainId: req.chainId, tokenAddress: token1, ownerAddress: userAddress }),
      ]);

      if (allow0 < amount0) {
        const app0 = prepareUniswapApprove({
          chainId: req.chainId,
          tokenAddress: token0,
          amountAtomic: amount0,
          symbol: defaultPair.token0Symbol,
        });
        return NextResponse.json({
          data: {
            step: 1,
            totalSteps: 3,
            stepName: `Approve ${defaultPair.token0Symbol} for Uniswap V3`,
            requiresApproval: true,
            instruction: serializeInstruction(app0),
            note: `Approve NonfungiblePositionManager to use ${defaultPair.token0Symbol} before minting LP.`,
          },
        });
      }

      if (allow1 < amount1) {
        const app1 = prepareUniswapApprove({
          chainId: req.chainId,
          tokenAddress: token1,
          amountAtomic: amount1,
          symbol: defaultPair.token1Symbol,
        });
        return NextResponse.json({
          data: {
            step: 2,
            totalSteps: 3,
            stepName: `Approve ${defaultPair.token1Symbol} for Uniswap V3`,
            requiresApproval: true,
            instruction: serializeInstruction(app1),
            note: `Approve NonfungiblePositionManager to use ${defaultPair.token1Symbol} before minting LP.`,
          },
        });
      }

      const range = computeStablecoinTickRange(req.feeTier, 20);
      const mintInst = prepareUniswapMint({
        chainId: req.chainId,
        token0,
        token1,
        feeTier: req.feeTier,
        tickLower: range.tickLower,
        tickUpper: range.tickUpper,
        amount0DesiredAtomic: amount0,
        amount1DesiredAtomic: amount1,
        recipient: userAddress,
      });

      return NextResponse.json({
        data: {
          step: 3,
          totalSteps: 3,
          stepName: `Mint ${defaultPair.pairLabel} LP`,
          requiresApproval: false,
          instruction: serializeInstruction(mintInst),
          note: `Mint concentrated liquidity in tight range [${range.tickLower}, ${range.tickUpper}].`,
        },
      });
    } catch (err) {
      return NextResponse.json(
        { error: { message: (err as Error).message ?? "Failed to check Uniswap LP allowances" } },
        { status: 500 },
      );
    }
  }

  // 4. Uniswap Collect Fees
  if (req.action === "uniswap_collect") {
    const config = UNISWAP_V3_CONFIG[req.chainId];
    if (!config) {
      return NextResponse.json({ error: { message: `Unsupported chain ${req.chainId} for Uniswap V3` } }, { status: 400 });
    }

    const collectInst = prepareUniswapCollect({
      chainId: req.chainId,
      tokenId: BigInt(req.tokenId),
      recipient: userAddress,
    });

    return NextResponse.json({
      data: {
        step: 1,
        totalSteps: 1,
        stepName: "Collect Uniswap Fees",
        requiresApproval: false,
        instruction: serializeInstruction(collectInst),
        note: `Collect accrued swap fees from NFT LP #${req.tokenId}.`,
      },
    });
  }

  // 5. Tokenized Equity Swap (Live dual NAV + DEX check; Step 1 Approve -> Step 2 SwapRouter02)
  if (req.action === "equity_swap") {
    const asset = getVerifiedEquityAsset(req.chainId, req.contractAddress);
    if (!asset) {
      return NextResponse.json(
        { error: { message: `Unverified equity asset at ${req.contractAddress} on chain ${req.chainId}` } },
        { status: 400 },
      );
    }

    const liveQuote = await fetchLiveEquityDualQuote(asset);
    const isCommodity = asset.wrapperType === "physical_commodity";
    const evalResult = evaluateEquityPriceProvenance({
      dexPriceUsd: liveQuote.dexPriceUsd,
      referenceNavUsd: liveQuote.referenceNavUsd,
      maxNavDeviationBps: req.maxNavDeviationBps,
      allowOffHoursExecution: req.allowOffHoursExecution || isCommodity,
      isCommodity,
    });

    if (!evalResult.allowed) {
      return NextResponse.json(
        {
          error: {
            message: evalResult.refusalReason ?? "Price provenance check failed",
            provenance: evalResult.provenance,
            sources: { nav: liveQuote.referenceSource, dex: liveQuote.dexSource },
          },
        },
        { status: 409 },
      );
    }

    const amountAtomic = BigInt(req.amountAtomic);
    const spendToken = req.direction === "buy" ? asset.quoteUsdcAddress : asset.contractAddress;
    const currentAllowance = await getEquityAllowance({
      chainId: asset.chainId,
      tokenAddress: spendToken,
      ownerAddress: userAddress,
      spenderAddress: asset.swapRouterAddress,
    });

    if (currentAllowance < amountAtomic) {
      const approveInst = prepareEquityApprove({
        chainId: asset.chainId,
        usdcAddress: spendToken,
        dexRouterAddress: asset.swapRouterAddress,
        amountAtomic,
        equityAsset: asset,
        provenance: evalResult.provenance,
      });

      return NextResponse.json({
        data: {
          step: 1,
          totalSteps: 2,
          stepName: `Approve ${req.direction === "buy" ? "USDC" : asset.symbol} for ${asset.symbol}`,
          requiresApproval: true,
          instruction: serializeInstruction(approveInst),
          provenance: evalResult.provenance,
          asset,
          sources: { nav: liveQuote.referenceSource, dex: liveQuote.dexSource },
          note: `Live dual check passed: ${liveQuote.referenceSource} NAV $${evalResult.provenance.referenceNavUsd.toFixed(2)}, ${liveQuote.dexSource} $${evalResult.provenance.dexExecutionPriceUsd.toFixed(2)} (Spread: ${evalResult.provenance.navDeviationBps} bps, Session: ${evalResult.provenance.sessionStatus}).`,
        },
      });
    }

    // Compute exact integer minOutputAtomic cleanly using integer arithmetic
    const dexPriceScaled = BigInt(Math.round(evalResult.provenance.dexExecutionPriceUsd * 10_000));
    const slippageMult = BigInt(10_000 - req.slippageBps);
    let minOutputAtomic = 1n;
    if (req.direction === "buy") {
      // input is USDC (6 dec); output is equity (asset.decimals)
      const scale = 10n ** BigInt(asset.decimals);
      const rawOut = (amountAtomic * scale * 10_000n) / (dexPriceScaled * 1_000_000n);
      minOutputAtomic = (rawOut * slippageMult) / 10_000n || 1n;
    } else {
      const scale = 10n ** BigInt(asset.decimals);
      const rawOut = (amountAtomic * dexPriceScaled * 1_000_000n) / (scale * 10_000n);
      minOutputAtomic = (rawOut * slippageMult) / 10_000n || 1n;
    }

    const swapInst = prepareEquitySwap({
      direction: req.direction,
      amountAtomic,
      minOutputAtomic,
      recipient: userAddress,
      equityAsset: asset,
      provenance: evalResult.provenance,
    });

    return NextResponse.json({
      data: {
        step: 2,
        totalSteps: 2,
        stepName: `${req.direction === "buy" ? "Buy" : "Sell"} ${asset.symbol} via SwapRouter02`,
        requiresApproval: false,
        instruction: serializeInstruction(swapInst),
        provenance: evalResult.provenance,
        asset,
        sources: { nav: liveQuote.referenceSource, dex: liveQuote.dexSource },
        note: `Non-atomic Step 2 Swap ready. Min output protected at ${req.slippageBps} bps slippage against live DEX price $${evalResult.provenance.dexExecutionPriceUsd.toFixed(2)}.`,
      },
    });
  }

  return NextResponse.json({ error: { message: "Unknown action" } }, { status: 400 });
}
