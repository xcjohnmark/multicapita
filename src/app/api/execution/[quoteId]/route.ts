import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db/client";
import { getOneClickClient, TERMINAL_STATUSES } from "@/lib/near/oneclick";
import { clientKey, rateLimited } from "@/lib/http/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Poll settlement state for a prepared move.
 *
 * Terminal states are mapped onto the local Quote status and returned verbatim. An unknown
 * provider state is surfaced as-is and is never treated as success.
 */

const STATUS_MAP: Record<string, string> = {
  SUCCESS: "success",
  FAILED: "failed",
  REFUNDED: "refunded",
  INCOMPLETE_DEPOSIT: "incomplete_deposit",
  PENDING_DEPOSIT: "deposited",
  KNOWN_DEPOSIT_TX: "deposited",
  PROCESSING: "processing",
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ quoteId: string }> },
) {
  if (rateLimited(clientKey(request), { max: 60 })) {
    return NextResponse.json(
      { error: { message: "Too many status requests. Try again in a minute." } },
      { status: 429 },
    );
  }

  const { quoteId } = await params;
  const prisma = getPrisma();
  const quote = await prisma.quote.findUnique({ where: { id: quoteId } });

  if (!quote) {
    return NextResponse.json({ error: { message: "Quote not found." } }, { status: 404 });
  }
  if (!quote.depositAddress) {
    return NextResponse.json(
      { error: { message: "This quote has no deposit address; nothing to poll." } },
      { status: 409 },
    );
  }

  const status = await getOneClickClient().getStatus(quote.depositAddress);
  const mapped = STATUS_MAP[status.status] ?? "processing";

  if (status.isTerminal) {
    await prisma.quote.update({ where: { id: quote.id }, data: { status: mapped } });
  }

  return NextResponse.json({
    data: {
      quoteId: quote.id,
      status: status.status,
      isTerminal: status.isTerminal,
      terminalStates: [...TERMINAL_STATUSES],
      correlationId: status.correlationId ?? quote.quoteReference,
      updatedAt: status.updatedAt ?? null,
      localStatus: mapped,
      depositAddress: quote.depositAddress,
      note:
        "A 1Click swap settles one leg. Multi-leg strategies are a sequence of independently confirmed steps.",
    },
  });
}
