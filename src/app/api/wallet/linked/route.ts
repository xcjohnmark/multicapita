import { NextResponse } from "next/server";
import { z } from "zod";
import { isAddress } from "viem";
import { SUPPORTED_WALLET_CHAINS } from "@/lib/auth/link";
import { getViewer } from "@/lib/auth/viewer";
import { getPrisma } from "@/lib/db/client";
import { isSameOrigin } from "@/lib/http/origin";
import { clientKey, rateLimited } from "@/lib/http/rate-limit";
import { listAccountWallets } from "@/lib/wallet/accounts";

export const dynamic = "force-dynamic";

/**
 * Watch-only wallets (balances read, never signed for) and removal of any linked wallet.
 * Owned wallets are added through `/api/wallet/link/*`, which requires a signature.
 */

const watchSchema = z.object({
  address: z.string().trim().refine((value) => isAddress(value, { strict: false }), "Enter a valid 0x address."),
  label: z.string().trim().max(40).optional(),
});

const removeSchema = z.object({ address: z.string().trim().min(3).max(120) });

export async function GET() {
  const viewer = await getViewer();
  if (!viewer || viewer.demo) {
    return NextResponse.json({ error: { message: "Sign in to manage wallets." } }, { status: 401 });
  }
  return NextResponse.json({ data: { wallets: await listAccountWallets(viewer.userId, viewer.address) } });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: { message: "Cross-origin request refused." } }, { status: 403 });
  }
  if (rateLimited(`wallet-link:${clientKey(request)}`, { max: 20 })) {
    return NextResponse.json({ error: { message: "Too many wallet updates." } }, { status: 429 });
  }
  const viewer = await getViewer();
  if (!viewer || viewer.demo) {
    return NextResponse.json({ error: { message: "Sign in to add wallets." } }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { message: "Invalid JSON body." } }, { status: 400 });
  }
  const parsed = watchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { message: parsed.error.issues[0]?.message ?? "Invalid wallet." } }, { status: 400 });
  }

  const address = parsed.data.address.toLowerCase();
  const prisma = getPrisma();
  for (const chainId of SUPPORTED_WALLET_CHAINS) {
    await prisma.wallet.upsert({
      where: { userId_chainId_address: { userId: viewer.userId, chainId, address } },
      // An already-verified wallet keeps its verification; only the label changes.
      update: parsed.data.label ? { label: parsed.data.label } : {},
      create: { userId: viewer.userId, address, chainFamily: "evm", chainId, label: parsed.data.label || "Watch only" },
    });
  }
  await prisma.auditEvent.create({
    data: { userId: viewer.userId, eventType: "wallet.watch_added", actorType: "user", details: { address } },
  });
  return NextResponse.json({ data: { address } });
}

export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: { message: "Cross-origin request refused." } }, { status: 403 });
  }
  const viewer = await getViewer();
  if (!viewer || viewer.demo) {
    return NextResponse.json({ error: { message: "Sign in to manage wallets." } }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { message: "Invalid JSON body." } }, { status: 400 });
  }
  const parsed = removeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: { message: "An address is required." } }, { status: 400 });

  const address = parsed.data.address.toLowerCase();
  if (viewer.address && address === viewer.address.toLowerCase()) {
    return NextResponse.json({ error: { message: "You're signed in with this wallet. Sign in with another one to remove it." } }, { status: 400 });
  }
  const prisma = getPrisma();
  const removed = await prisma.wallet.deleteMany({ where: { userId: viewer.userId, address } });
  if (removed.count === 0) return NextResponse.json({ error: { message: "Wallet not found." } }, { status: 404 });
  await prisma.auditEvent.create({
    data: { userId: viewer.userId, eventType: "wallet.removed", actorType: "user", details: { address } },
  });
  return NextResponse.json({ data: { removed: address } });
}
