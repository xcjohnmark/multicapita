import { NextResponse } from "next/server";
import { z } from "zod";
import { getOneClickClient, OneClickError } from "@/lib/near/oneclick";
import { quoteInputSchema } from "@/lib/near/route-preview";

export const dynamic = "force-dynamic";

/**
 * Preview-only quote endpoint.
 *
 * It always requests `dry: true`. It therefore never creates a deposit address and can
 * never move funds. The executable path lives behind an authenticated execution flow
 * (user wallet signature + policy checks), which is intentionally not reachable from here.
 */

const bodySchema = quoteInputSchema.extend({
  originAssetId: z.string().min(1),
  destinationAssetId: z.string().min(1),
});

const EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const NEAR_ACCOUNT = /^[a-z\d]+([-_][a-z\d]+)*(\.[a-z\d]+([-_][a-z\d]+)*)*$/;

// Best-effort in-process limit. Documented as non-distributed: it protects the demo
// deployment from accidental loops, not from a determined attacker.
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 30;
const hits = new Map<string, number[]>();

function rateLimited(key: string, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 1_000) hits.clear();
  return recent.length > MAX_REQUESTS;
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: { message: "Too many quote requests. Try again in a minute." } },
      { status: 429 },
    );
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
          message: "Invalid quote request",
          fields: parsed.error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        },
      },
      { status: 400 },
    );
  }

  const input = parsed.data;

  const isEvmRecipient =
    input.recipientType === "DESTINATION_CHAIN" ? EVM_ADDRESS.test(input.recipient) : true;
  const isIntentRecipient =
    input.recipientType === "INTENTS"
      ? NEAR_ACCOUNT.test(input.recipient) || EVM_ADDRESS.test(input.recipient)
      : true;

  if (!isEvmRecipient || !isIntentRecipient) {
    return NextResponse.json(
      {
        error: {
          message:
            input.recipientType === "INTENTS"
              ? "Recipient must be a NEAR account or 0x address for Intents delivery"
              : "Recipient must be a valid 0x EVM address for destination-chain delivery",
        },
      },
      { status: 400 },
    );
  }

  try {
    const client = getOneClickClient();
    const { tokens, fetchedAt } = await client.getTokens();
    const origin = tokens.find((t) => t.assetId === input.originAssetId);
    const destination = tokens.find((t) => t.assetId === input.destinationAssetId);

    if (!origin || !destination) {
      return NextResponse.json(
        {
          error: {
            message: "Asset is not in the live 1Click catalogue. Refresh and select again.",
          },
        },
        { status: 400 },
      );
    }

    const quote = await client.createQuote({
      dry: true,
      swapType: "EXACT_INPUT",
      slippageTolerance: input.slippageBps,
      originAsset: origin.assetId,
      destinationAsset: destination.assetId,
      amount: input.amountAtomic,
      depositType: "ORIGIN_CHAIN",
      recipient: input.recipient,
      recipientType: input.recipientType,
      refundTo: input.refundTo,
      refundType: "ORIGIN_CHAIN",
      deadline: new Date(Date.now() + 5 * 60_000).toISOString(),
    });

    return NextResponse.json({
      data: {
        dry: true,
        origin,
        destination,
        quote: quote.quote,
        correlationId: quote.correlationId,
        timestamp: quote.timestamp,
        signaturePresent: Boolean(quote.signature),
      },
      meta: {
        source: "1click",
        catalogueFetchedAt: new Date(fetchedAt).toISOString(),
        note: "Dry quote. No deposit address created; no funds move.",
      },
    });
  } catch (error) {
    const status = error instanceof OneClickError && error.httpStatus === 400 ? 422 : 502;
    return NextResponse.json(
      {
        error: {
          message: error instanceof Error ? error.message : "Quote failed",
          correlationId: error instanceof OneClickError ? error.correlationId : undefined,
        },
      },
      { status },
    );
  }
}
