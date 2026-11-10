import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db/client";
import { getOneClickClient } from "@/lib/near/oneclick";
import { clientKey, rateLimited } from "@/lib/http/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Notify 1Click of the deposit transaction and record it.
 *
 * The transaction hash comes from the user's wallet. It is validated as a 32-byte hex hash and
 * is only ever associated with a quote this server created and that still has a deposit address.
 * Nothing here signs anything: the wallet already did.
 */

const TX_HASH = /^0x[a-fA-F0-9]{64}$/;

export async function POST(request: Request) {
  if (rateLimited(clientKey(request), { max: 20 })) {
    return NextResponse.json(
      { error: { message: "Too many deposit submissions. Try again in a minute." } },
      { status: 429 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: { message: "Invalid JSON body" } }, { status: 400 });
  }

  const body = payload as { quoteId?: unknown; txHash?: unknown };
  const quoteId = typeof body.quoteId === "string" ? body.quoteId : "";
  const txHash = typeof body.txHash === "string" ? body.txHash : "";

  if (!quoteId || !TX_HASH.test(txHash)) {
    return NextResponse.json(
      { error: { message: "A quote id and a 32-byte transaction hash are required." } },
      { status: 400 },
    );
  }

  const prisma = getPrisma();
  const quote = await prisma.quote.findUnique({ where: { id: quoteId } });
  if (!quote) {
    return NextResponse.json({ error: { message: "Quote not found." } }, { status: 404 });
  }
  if (!quote.depositAddress || quote.status !== "quoted") {
    return NextResponse.json(
      { error: { message: "This quote is not waiting for a deposit." } },
      { status: 409 },
    );
  }
  if (quote.chainId === null) {
    return NextResponse.json(
      { error: { message: "This quote has no origin chain recorded." } },
      { status: 409 },
    );
  }

  const user = await prisma.user.findUnique({ where: { id: quote.userId }, select: { id: true } });
  if (!user) {
    return NextResponse.json({ error: { message: "No user session." } }, { status: 409 });
  }

  try {
    await getOneClickClient().submitDeposit(quote.depositAddress, txHash);
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          message:
            error instanceof Error
              ? `1Click did not accept the deposit notification: ${error.message}`
              : "Deposit notification failed",
        },
      },
      { status: 502 },
    );
  }

  const transaction = await prisma.transaction.create({
    data: {
      userId: user.id,
      quoteId: quote.id,
      chainId: quote.chainId,
      txHash,
      transactionType: "deposit",
      fromAddress: quote.refundTo,
      toAddress: quote.depositAddress,
      status: "pending",
    },
  });

  await prisma.quote.update({
    where: { id: quote.id },
    data: { status: "deposited" },
  });

  await prisma.auditEvent.create({
    data: {
      userId: user.id,
      eventType: "execution.deposited",
      actorType: "user",
      referenceId: quote.id,
      details: {
        txHash,
        depositAddress: quote.depositAddress,
        correlationId: quote.quoteReference,
      },
    },
  });

  return NextResponse.json({
    data: {
      transactionId: transaction.id,
      txHash,
      status: "pending",
      quoteStatus: "deposited",
    },
  });
}
