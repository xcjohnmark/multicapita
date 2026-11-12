import { NextResponse } from "next/server";
import { verifyMessage, type Hex } from "viem";
import { z } from "zod";
import { consumeNonce } from "@/lib/auth/nonce";
import { newSessionPayload, SESSION_COOKIE, sessionCookieOptions, signSession } from "@/lib/auth/session";
import { parseSiweMessage } from "@/lib/auth/siwe";
import { getPrisma } from "@/lib/db/client";
import { isSameOrigin, requestOrigin } from "@/lib/http/origin";
import { clientKey, rateLimited } from "@/lib/http/rate-limit";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  message: z.string().min(40).max(4_000),
  signature: z.string().regex(/^0x[a-fA-F0-9]+$/, "A hex signature is required"),
});

/**
 * Verify a SIWE signature and start a session.
 *
 * The nonce is consumed before the signature is checked. That is deliberate: a failed attempt must
 * not leave a reusable challenge behind for an attacker to grind against.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: { message: "Cross-origin request refused." } }, { status: 403 });
  }
  if (rateLimited(`auth-verify:${clientKey(request)}`, { max: 10 })) {
    return NextResponse.json({ error: { message: "Too many attempts." } }, { status: 429 });
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
      { error: { message: "Invalid verification request." } },
      { status: 400 },
    );
  }

  const fields = parseSiweMessage(parsed.data.message);
  if (!fields) {
    return NextResponse.json({ error: { message: "Malformed sign-in message." } }, { status: 400 });
  }

  const { host } = requestOrigin(request);
  if (fields.domain !== host) {
    return NextResponse.json(
      { error: { message: "The sign-in message was issued for a different host." } },
      { status: 400 },
    );
  }

  const expiresAt = new Date(fields.expirationTime);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
    return NextResponse.json({ error: { message: "The sign-in challenge has expired." } }, { status: 401 });
  }

  const consumption = await consumeNonce({
    nonce: fields.nonce,
    address: fields.address,
    domain: host,
  });
  if (!consumption.ok) {
    return NextResponse.json(
      { error: { message: `The sign-in challenge is no longer valid (${consumption.reason}).` } },
      { status: 401 },
    );
  }

  let valid = false;
  try {
    valid = await verifyMessage({
      address: fields.address as Hex,
      message: parsed.data.message,
      signature: parsed.data.signature as Hex,
    });
  } catch {
    valid = false;
  }

  if (!valid) {
    return NextResponse.json(
      { error: { message: "The signature does not match the address." } },
      { status: 401 },
    );
  }

  const prisma = getPrisma();
  const address = fields.address.toLowerCase();

  const user = await prisma.user.upsert({
    where: { address },
    create: { address },
    update: {},
    select: { id: true, email: true },
  });

  const now = new Date();
  for (const chainId of [8453, 42161]) {
    await prisma.wallet.upsert({
      where: { userId_chainId_address: { userId: user.id, chainId, address } },
      create: {
        userId: user.id,
        chainId,
        address,
        chainFamily: "evm",
        ownershipVerifiedAt: now,
        label: "Signed-in wallet",
      },
      update: { ownershipVerifiedAt: now },
    });
  }

  await prisma.auditEvent.create({
    data: {
      userId: user.id,
      eventType: "auth.signed_in",
      actorType: "user",
      details: { address, domain: host, chainId: fields.chainId },
    },
  });

  const token = signSession(newSessionPayload(user.id, address));
  const response = NextResponse.json({
    data: {
      authenticated: true,
      userId: user.id,
      address,
      email: user.email,
    },
  });
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  response.headers.set("cache-control", "no-store");
  return response;
}
