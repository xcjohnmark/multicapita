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
  prepareUniswapCollect,
  prepareUniswapMint,
  UNISWAP_V3_CONFIG,
} from "@/lib/protocols/uniswap";
import {
  evaluateEquityPriceProvenance,
  getVerifiedEquityAsset,
  prepareEquityApprove,
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
    token0: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    token1: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
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
    dexRouterAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    amountAtomic: z.string().regex(/^\d+$/),
    dexPriceUsd: z.number().positive(),
    referenceNavUsd: z.number().positive(),
    maxNavDeviationBps: z.number().int().default(150),
    allowOffHoursExecution: z.boolean().default(false),
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

      // If allowance is insufficient, first step is approval
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
            note: "First transaction approves the Aave Pool contract to transfer your USDC. Once confirmed, proceed to Supply.",
          },
        });
      }

      // Allowance is sufficient, supply directly
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
          note: "Deposit USDC into Aave V3 on Base/Arbitrum to receive interest-bearing aTokens.",
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

  // 3. Uniswap Mint LP
  if (req.action === "uniswap_mint") {
    const config = UNISWAP_V3_CONFIG[req.chainId];
    if (!config) {
      return NextResponse.json({ error: { message: `Unsupported chain ${req.chainId} for Uniswap V3` } }, { status: 400 });
    }

    const range = computeStablecoinTickRange(req.feeTier, 20);
    const mintInst = prepareUniswapMint({
      chainId: req.chainId,
      token0: req.token0 as Address,
      token1: req.token1 as Address,
      feeTier: req.feeTier,
      tickLower: range.tickLower,
      tickUpper: range.tickUpper,
      amount0DesiredAtomic: BigInt(req.amount0DesiredAtomic),
      amount1DesiredAtomic: BigInt(req.amount1DesiredAtomic),
      recipient: userAddress,
    });

    return NextResponse.json({
      data: {
        step: 1,
        totalSteps: 1,
        stepName: "Mint Uniswap V3 LP",
        instruction: serializeInstruction(mintInst),
        note: `Mint concentrated liquidity position in tight stable range [${range.tickLower}, ${range.tickUpper}].`,
      },
    });
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
        instruction: serializeInstruction(collectInst),
        note: `Collect accrued swap fees from NFT LP #${req.tokenId}.`,
      },
    });
  }

  // 5. Tokenized Equity Swap
  if (req.action === "equity_swap") {
    const asset = getVerifiedEquityAsset(req.chainId, req.contractAddress);
    if (!asset) {
      return NextResponse.json(
        { error: { message: `Unverified equity asset at ${req.contractAddress} on chain ${req.chainId}` } },
        { status: 400 },
      );
    }

    const evalResult = evaluateEquityPriceProvenance({
      dexPriceUsd: req.dexPriceUsd,
      referenceNavUsd: req.referenceNavUsd,
      maxNavDeviationBps: req.maxNavDeviationBps,
      allowOffHoursExecution: req.allowOffHoursExecution,
    });

    if (!evalResult.allowed) {
      return NextResponse.json(
        {
          error: {
            message: evalResult.refusalReason ?? "Price provenance check failed",
            provenance: evalResult.provenance,
          },
        },
        { status: 409 },
      );
    }

    const usdcAddress = (
      req.chainId === 8453
        ? "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"
        : "0xaf88d065e77c8cc2239327c5edb3a432268e5831"
    ) as Address;

    const approveInst = prepareEquityApprove({
      chainId: req.chainId,
      usdcAddress,
      dexRouterAddress: req.dexRouterAddress as Address,
      amountAtomic: BigInt(req.amountAtomic),
      equityAsset: asset,
      provenance: evalResult.provenance,
    });

    return NextResponse.json({
      data: {
        step: 1,
        totalSteps: 2,
        stepName: `Approve USDC for ${asset.symbol}`,
        instruction: serializeInstruction(approveInst),
        provenance: evalResult.provenance,
        asset,
        note: `Dual price check passed: Reference NAV $${req.referenceNavUsd.toFixed(2)}, DEX Price $${req.dexPriceUsd.toFixed(2)} (Spread: ${evalResult.provenance.navDeviationBps} bps, Session: ${evalResult.provenance.sessionStatus}).`,
      },
    });
  }

  return NextResponse.json({ error: { message: "Unknown action" } }, { status: 400 });
}
