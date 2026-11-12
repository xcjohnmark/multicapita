import { getClient } from "./registry";
import { OneClickError } from "./oneclick";
import { getChain } from "@/lib/chains";
import { usdToCents } from "@/lib/finance/allocation";
import type { RouteCostResult } from "@/lib/ai/tools";

/**
 * Live cost of moving USDC between two supported chains, derived from a real dry quote.
 *
 * This is the number the AI may cite when comparing a cross-chain leg against a same-chain one.
 * It is computed from `amountIn`/`amountOut` of an actual quote, never from a published fee table
 * — the documented unauthenticated surcharge did not match observed costs.
 */
export async function quoteCrossChainCost(input: {
  fromChainId: number;
  toChainId: number;
  amountUsd: number;
}): Promise<RouteCostResult> {
  const origin = getChain(input.fromChainId);
  const destination = getChain(input.toChainId);
  if (!origin || !destination) {
    return { ok: false, error: "Only Base (8453) and Arbitrum (42161) are supported." };
  }
  if (origin.id === destination.id) {
    return { ok: false, error: "Origin and destination are the same chain." };
  }

  // USDC has 6 decimals; cents * 10^4 == atomic units.
  const amountAtomic = (usdToCents(input.amountUsd) * 10_000n).toString();

  try {
    const client = getClient();
    const { tokens } = await client.getTokens();

    const findUsdc = (chain: typeof origin) =>
      tokens.find(
        (token) =>
          token.blockchain === chain.oneClickBlockchain &&
          token.symbol === "USDC" &&
          token.contractAddress?.toLowerCase() === chain.usdc.address.toLowerCase(),
      );

    const originToken = findUsdc(origin);
    const destinationToken = findUsdc(destination);
    if (!originToken || !destinationToken) {
      return { ok: false, error: "USDC is not listed for one of these chains in the 1Click catalogue." };
    }

    const quote = await client.createQuote({
      dry: true,
      swapType: "EXACT_INPUT",
      slippageTolerance: 100,
      originAsset: originToken.assetId,
      destinationAsset: destinationToken.assetId,
      amount: amountAtomic,
      depositType: "ORIGIN_CHAIN",
      recipient: "0x1111111111111111111111111111111111111111",
      recipientType: "DESTINATION_CHAIN",
      refundTo: "0x1111111111111111111111111111111111111111",
      refundType: "ORIGIN_CHAIN",
      deadline: new Date(Date.now() + 5 * 60_000).toISOString(),
    });

    const amountIn = BigInt(quote.quote.amountIn);
    const amountOut = BigInt(quote.quote.amountOut);
    if (amountIn <= 0n) return { ok: false, error: "Quote returned a zero input amount." };

    const loss = amountIn > amountOut ? amountIn - amountOut : 0n;
    const impliedCostBps = Number((loss * 1_000_000n) / amountIn) / 100;

    return {
      ok: true,
      impliedCostBps,
      quotedOutUsd: Number(amountOut) / 1_000_000,
      minutes: quote.quote.timeEstimate ? Math.round(quote.quote.timeEstimate / 60) : null,
      source: "1click dry quote",
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof OneClickError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Route quote failed",
    };
  }
}
