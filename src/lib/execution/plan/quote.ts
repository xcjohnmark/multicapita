import { legCostBps } from "@/lib/finance/plan-sizing";
import { applySlippageDown } from "@/lib/finance/amounts";
import { getClient } from "@/lib/near/registry";
import { OneClickError, type OneClickToken } from "@/lib/near/oneclick";
import { findCatalogueToken } from "./assets";

/**
 * Dry 1Click quote for one plan leg. Research only: a dry quote has no deposit address and can
 * never be funded (AGENTS.md rule 2). The leg's guaranteed minimum is recomputed here from the
 * quoted output and the slippage the user chose, never trusted from a display value.
 */

/** Non-zero placeholder used when the visitor has no wallet. Nothing is delivered anywhere. */
export const DRY_QUOTE_PLACEHOLDER = "0x1111111111111111111111111111111111111111";

export type LegQuote = {
  amountInAtomic: string;
  amountOutAtomic: string;
  minAmountOutAtomic: string;
  costBps: number | null;
  timeEstimateSeconds: number | null;
  correlationId: string;
  quotedAt: string;
  source: "1click";
  dry: true;
};

export type LegToken = { chainId: number; address: string; decimals: number; symbol: string };

export async function resolveCatalogueToken(token: LegToken): Promise<OneClickToken | null> {
  const { tokens } = await getClient().getTokens();
  return findCatalogueToken(tokens, token.chainId, token.address);
}

export async function dryLegQuote(input: {
  from: LegToken;
  to: LegToken;
  amountAtomic: bigint;
  slippageBps: number;
  recipient: string | null;
}): Promise<{ ok: true; quote: LegQuote } | { ok: false; error: string }> {
  try {
    const client = getClient();
    const { tokens } = await client.getTokens();
    const origin = findCatalogueToken(tokens, input.from.chainId, input.from.address);
    const destination = findCatalogueToken(tokens, input.to.chainId, input.to.address);
    if (!origin || !destination) {
      return { ok: false, error: `${!origin ? input.from.symbol : input.to.symbol} isn't routable through 1Click on this network.` };
    }
    const recipient = input.recipient ?? DRY_QUOTE_PLACEHOLDER;
    const quote = await client.createQuote({
      dry: true,
      swapType: "EXACT_INPUT",
      slippageTolerance: input.slippageBps,
      originAsset: origin.assetId,
      destinationAsset: destination.assetId,
      amount: input.amountAtomic.toString(),
      depositType: "ORIGIN_CHAIN",
      recipient,
      recipientType: "DESTINATION_CHAIN",
      refundTo: recipient,
      refundType: "ORIGIN_CHAIN",
      deadline: new Date(Date.now() + 5 * 60_000).toISOString(),
    });
    const amountOut = BigInt(quote.quote.amountOut);
    const sameAsset = input.from.symbol.toUpperCase() === input.to.symbol.toUpperCase();
    return {
      ok: true,
      quote: {
        amountInAtomic: quote.quote.amountIn,
        amountOutAtomic: quote.quote.amountOut,
        minAmountOutAtomic: applySlippageDown(amountOut, input.slippageBps).toString(),
        // Cost in bps is only meaningful for a same-asset leg (USDC → USDC). A swap's "cost" would
        // mix price and fees, so it is left to the USD values instead.
        costBps: sameAsset
          ? legCostBps({
              amountInAtomic: BigInt(quote.quote.amountIn),
              decimalsIn: origin.decimals,
              amountOutAtomic: amountOut,
              decimalsOut: destination.decimals,
            })
          : null,
        timeEstimateSeconds: quote.quote.timeEstimate ?? null,
        correlationId: quote.correlationId,
        quotedAt: quote.timestamp ?? new Date().toISOString(),
        source: "1click",
        dry: true,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof OneClickError || error instanceof Error ? error.message : "1Click quote failed.",
    };
  }
}
