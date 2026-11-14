import { NextResponse } from "next/server";
import { verifyMessage, type Hex } from "viem";
import { z } from "zod";
import { linkStatement, SUPPORTED_WALLET_CHAINS } from "@/lib/auth/link";
import { consumeNonce } from "@/lib/auth/nonce";
import { parseSiweMessage } from "@/lib/auth/siwe";
import { getViewer } from "@/lib/auth/viewer";
import { getPrisma } from "@/lib/db/client";
import { isSameOrigin, requestOrigin } from "@/lib/http/origin";
import { clientKey, rateLimited } from "@/lib/http/rate-limit";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  message: z.string().min(40).max(4_000),
  signature: z.string().regex(/^0x[a-fA-F0-9]+$/),
});

/**
 * Verify a link signature and attach the wallet to the signed-in account as an owned (verified)
 * wallet on every supported chain. A wallet can be verified by one account only.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: { message: "Cross-origin request refused." } }, { status: 403 });
  }
  if (rateLimited(`wallet-link-verify:${clientKey(request)}`, { max: 10 })) {
    return NextResponse.json({ error: { message: "Too many attempts." } }, { status: 429 });
  }
  const viewer = await getViewer();
  if (!viewer || viewer.demo || !viewer.address) {
    return NextResponse.json({ error: { message: "Sign in before linking another wallet." } }, { status: 401 });
  }
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: { message: "Invalid JSON body." } }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) return NextResponse.json({ error: { message: "Invalid link request." } }, { status: 400 });

  const fields = parseSiweMessage(parsed.data.message);
  const { host } = requestOrigin(request);
  if (!fields || fields.domain !== host) {
    return NextResponse.json({ error: { message: "This link message isn't valid here." } }, { status: 400 });
  }
  if (fields.statement !== linkStatement(viewer.address)) {
    return NextResponse.json({ error: { message: "This signature was made for a different account." } }, { status: 400 });
  }
  if (new Date(fields.expirationTime).getTime() <= Date.now()) {
    return NextResponse.json({ error: { message: "The link request expired. Try again." } }, { status: 401 });
  }
  const consumed = await consumeNonce({ nonce: fields.nonce, address: fields.address, domain: host });
  if (!consumed.ok) {
    return NextResponse.json({ error: { message: `The link request is no longer valid (${consumed.reason}).` } }, { status: 401 });
  }
  let valid = false;
  try {
    valid = await verifyMessage({ address: fields.address as Hex, message: parsed.data.message, signature: parsed.data.signature as Hex });
  } catch {
    valid = false;
  }
  if (!valid) return NextResponse.json({ error: { message: "The signature doesn't match the wallet." } }, { status: 401 });

  const prisma = getPrisma();
  const address = fields.address.toLowerCase();
  if (address === viewer.address.toLowerCase()) {
    return NextResponse.json({ error: { message: "That wallet is already your sign-in wallet." } }, { status: 409 });
  }
  const [otherOwner, otherAccount] = await Promise.all([
    prisma.wallet.findFirst({
      where: { address, ownershipVerifiedAt: { not: null }, userId: { not: viewer.userId } },
      select: { id: true },
    }),
    prisma.user.findFirst({ where: { address, id: { not: viewer.userId } }, select: { id: true } }),
  ]);
  if (otherOwner || otherAccount) {
    return NextResponse.json(
      { error: { message: "This wallet already has its own Capita account. Sign in with it and remove it there first." } },
      { status: 409 },
    );
  }

  const now = new Date();
  for (const chainId of SUPPORTED_WALLET_CHAINS) {
    await prisma.wallet.upsert({
      where: { userId_chainId_address: { userId: viewer.userId, chainId, address } },
      create: { userId: viewer.userId, chainId, address, chainFamily: "evm", ownershipVerifiedAt: now, label: "Linked wallet" },
      update: { ownershipVerifiedAt: now },
    });
  }
  await prisma.auditEvent.create({
    data: { userId: viewer.userId, eventType: "wallet.verified_link", actorType: "user", details: { address } },
  });
  return NextResponse.json({ data: { address } });
}
