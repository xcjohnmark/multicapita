import { z } from "zod";
import { SUPPORTED_CHAINS } from "@/lib/chains";
import {
  OneClickClient,
  OneClickError,
  type OneClickToken,
} from "@/lib/near/oneclick";

/**
 * A live, non-executable route preview for the dashboard.
 *
 * It resolves asset IDs from the live catalogue (never hardcoded), requests a `dry: true`
 * quote, and derives the cost from the quote itself. Nothing is signed, nothing moves.
 */

export const ROUTE_PREVIEW_AMOUNT_ATOMIC = "100000000"; // 100 USDC (6 decimals)
const PREVIEW_TTL_MS = 60_000;
/** Non-zero placeholder recipient for a dry quote. Nothing is delivered anywhere. */
const PREVIEW_RECIPIENT = "0x1111111111111111111111111111111111111111";

export type RoutePreview =
  | {
      ok: true;
      mode: "dry_run";
      origin: { chain: string; symbol: string; assetId: string; amountAtomic: string };
      destination: { chain: string; symbol: string; assetId: string; amountAtomic: string };
      quotedOutputAtomic: string;
      minimumOutputAtomic: string | null;
      slippageBps: number;
      impliedCostBps: number;
      timeEstimateSeconds: number | null;
      correlationId: string;
      quotedAt: string;
      signaturePresent: boolean;
      source: "1click";
      note: string;
    }
  | {
      ok: false;
      mode: "dry_run";
      error: string;
      correlationId?: string;
      source: "1click";
    };

type CacheEntry = { preview: RoutePreview; at: number };
let cache: CacheEntry | null = null;

function usdcOn(chainSlug: string, tokens: OneClickToken[]): OneClickToken | undefined {
  const chain = SUPPORTED_CHAINS.find((c) => c.slug === chainSlug);
  if (!chain) return undefined;
  // Contract match, not symbol match: symbols are display metadata.
  return tokens.find(
    (t) =>
      t.blockchain === chain.oneClickBlockchain &&
      t.symbol === "USDC" &&
      t.contractAddress?.toLowerCase() === chain.usdc.address.toLowerCase(),
  );
}

function bpsCost(amountIn: string, amountOut: string): number {
  const input = BigInt(amountIn);
  if (input === 0n) return 0;
  const cost = input - BigInt(amountOut);
  if (cost <= 0n) return 0;
  // Keep 2 decimal places of a basis point without floating point on the raw amounts.
  return Number((cost * 1_000_000n) / input) / 100;
}

export async function getRoutePreview(
  client: OneClickClient = new OneClickClient(),
): Promise<RoutePreview> {
  if (cache && Date.now() - cache.at < PREVIEW_TTL_MS) return cache.preview;

  try {
    const { tokens } = await client.getTokens();
    const originToken = usdcOn("base", tokens);
    const destinationToken = usdcOn("arbitrum", tokens);

    if (!originToken || !destinationToken) {
      const preview: RoutePreview = {
        ok: false,
        mode: "dry_run",
        source: "1click",
        error: "USDC is not listed on Base or Arbitrum in the live 1Click catalogue.",
      };
      cache = { preview, at: Date.now() };
      return preview;
    }

    const quote = await client.createQuote({
      dry: true,
      swapType: "EXACT_INPUT",
      slippageTolerance: 100,
      originAsset: originToken.assetId,
      destinationAsset: destinationToken.assetId,
      amount: ROUTE_PREVIEW_AMOUNT_ATOMIC,
      depositType: "ORIGIN_CHAIN",
      recipient: PREVIEW_RECIPIENT,
      recipientType: "DESTINATION_CHAIN",
      refundTo: PREVIEW_RECIPIENT,
      refundType: "ORIGIN_CHAIN",
      deadline: new Date(Date.now() + 5 * 60_000).toISOString(),
    });

    const preview: RoutePreview = {
      ok: true,
      mode: "dry_run",
      origin: {
        chain: "Base",
        symbol: originToken.symbol,
        assetId: originToken.assetId,
        amountAtomic: quote.quote.amountIn,
      },
      destination: {
        chain: "Arbitrum One",
        symbol: destinationToken.symbol,
        assetId: destinationToken.assetId,
        amountAtomic: quote.quote.amountOut,
      },
      quotedOutputAtomic: quote.quote.amountOut,
      minimumOutputAtomic: quote.quote.minAmountOut ?? null,
      slippageBps: 100,
      impliedCostBps: bpsCost(quote.quote.amountIn, quote.quote.amountOut),
      timeEstimateSeconds: quote.quote.timeEstimate ?? null,
      correlationId: quote.correlationId,
      quotedAt: quote.timestamp ?? new Date().toISOString(),
      signaturePresent: Boolean(quote.signature),
      source: "1click",
      note: "Dry quote. No deposit address is created and no funds move.",
    };
    cache = { preview, at: Date.now() };
    return preview;
  } catch (error) {
    const preview: RoutePreview = {
      ok: false,
      mode: "dry_run",
      source: "1click",
      error:
        error instanceof OneClickError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Unknown 1Click error",
      correlationId: error instanceof OneClickError ? error.correlationId : undefined,
    };
    // Do not cache failures for long: the route may recover.
    cache = { preview, at: Date.now() - PREVIEW_TTL_MS + 10_000 };
    return preview;
  }
}

export const quoteInputSchema = z.object({
  originAssetId: z.string().min(1),
  destinationAssetId: z.string().min(1),
  amountAtomic: z.string().regex(/^\d+$/),
  slippageBps: z.number().int().min(0).max(1_000).default(100),
  recipient: z.string().min(1).max(128),
  recipientType: z.enum(["DESTINATION_CHAIN", "INTENTS"]).default("DESTINATION_CHAIN"),
  refundTo: z.string().min(1).max(128),
});
