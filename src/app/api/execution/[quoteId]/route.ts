import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db/client";
import { getClient } from "@/lib/near/registry";
import { TERMINAL_STATUSES } from "@/lib/near/oneclick";
import {
  isTerminalQuoteStatus,
  parseQuoteStatus,
  providerStatusToQuoteStatus,
} from "@/lib/domain/status";
import { clientKey, rateLimited } from "@/lib/http/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Poll settlement state for a prepared move.
 *
 * The provider status is returned verbatim. The local status is a validated mapping; an unknown
 * provider state becomes `unknown` and is never displayed as success or silently coerced to
 * `processing`. Every observed transition is appended to `QuoteStatusEvent`, so the timeline is
 * reconstructable rather than inferred from the current row.
 */
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

  const status = await getClient().getStatus(quote.depositAddress);
  const localStatus = providerStatusToQuoteStatus(status.status);
  const previous = parseQuoteStatus(quote.status);

  if (localStatus !== "unknown" && localStatus !== previous) {
    await prisma.$transaction([
      prisma.quote.update({ where: { id: quote.id }, data: { status: localStatus } }),
      prisma.quoteStatusEvent.create({
        data: {
          quoteId: quote.id,
          providerStatus: status.status,
          localStatus,
          raw: (status.raw ?? null) as object,
        },
      }),
    ]);
  } else if (localStatus === "unknown") {
    await prisma.quoteStatusEvent.create({
      data: {
        quoteId: quote.id,
        providerStatus: status.status,
        localStatus: "unknown",
        raw: (status.raw ?? null) as object,
      },
    });
  }

  const events = await prisma.quoteStatusEvent.findMany({
    where: { quoteId: quote.id },
    orderBy: { observedAt: "asc" },
    select: { providerStatus: true, localStatus: true, observedAt: true },
  });

  return NextResponse.json({
    data: {
      quoteId: quote.id,
      status: status.status,
      isTerminal: status.isTerminal,
      terminalStates: [...TERMINAL_STATUSES],
      localStatus,
      localTerminal: isTerminalQuoteStatus(localStatus),
      correlationId: status.correlationId ?? quote.quoteReference,
      updatedAt: status.updatedAt ?? null,
      depositAddress: quote.depositAddress,
      timeline: events.map((event) => ({
        providerStatus: event.providerStatus,
        localStatus: event.localStatus,
        observedAt: event.observedAt.toISOString(),
      })),
      note:
        "A 1Click swap settles one leg. Multi-leg strategies are a sequence of independently confirmed steps.",
    },
  });
}
