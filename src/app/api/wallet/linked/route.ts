import { NextResponse } from "next/server";
import { z } from "zod";
import { isAddress } from "viem";
import { getViewer } from "@/lib/auth/viewer";
import { getPrisma } from "@/lib/db/client";
import { isSameOrigin } from "@/lib/http/origin";
import { clientKey, rateLimited } from "@/lib/http/rate-limit";

export const dynamic = "force-dynamic";

const linkWalletSchema = z.object({
  address: z.string().trim().min(3).max(120),
  chainFamily: z.enum(["evm", "near", "solana"]),
  chainId: z.number().int().default(8453),
  label: z.string().trim().max(40).optional(),
});

const unlinkSchema = z.object({
  walletId: z.string().min(1),
});

export async function GET() {
  const viewer = await getViewer();
  if (!viewer || viewer.demo) {
    return NextResponse.json({ error: { message: "Sign in to manage wallets." } }, { status: 401 });
  }

  const wallets = await getPrisma().wallet.findMany({
    where: { userId: viewer.userId },
    orderBy: [{ ownershipVerifiedAt: "desc" }, { createdAt: "asc" }],
  });

  return NextResponse.json({ data: { wallets } });
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
    return NextResponse.json({ error: { message: "Sign in to import wallets." } }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { message: "Invalid JSON body." } }, { status: 400 });
  }

  const parsed = linkWalletSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { message: "Invalid wallet details." } }, { status: 400 });
  }

  const { chainFamily, chainId, label } = parsed.data;
  const rawAddr = parsed.data.address.trim();

  if (chainFamily === "evm" && !isAddress(rawAddr)) {
    return NextResponse.json({ error: { message: "Enter a valid 0x EVM address." } }, { status: 400 });
  }
  if (chainFamily === "near" && !/^[a-z0-9._-]+$/i.test(rawAddr)) {
    return NextResponse.json({ error: { message: "Enter a valid NEAR account ID." } }, { status: 400 });
  }

  const normalizedAddr = chainFamily === "solana" ? rawAddr : rawAddr.toLowerCase();
  const effectiveChainId = chainFamily === "evm" ? chainId : 0;

  const prisma = getPrisma();
  const wallet = await prisma.wallet.upsert({
    where: {
      userId_chainId_address: {
        userId: viewer.userId,
        chainId: effectiveChainId,
        address: normalizedAddr,
      },
    },
    update: { label: label ?? undefined },
    create: {
      userId: viewer.userId,
      address: normalizedAddr,
      chainFamily,
      chainId: effectiveChainId,
      label: label || `Imported ${chainFamily.toUpperCase()}`,
    },
  });

  await prisma.auditEvent.create({
    data: {
      userId: viewer.userId,
      eventType: "wallet.linked",
      actorType: "user",
      referenceId: wallet.id,
      details: { address: normalizedAddr, chainFamily, chainId: effectiveChainId },
    },
  });

  return NextResponse.json({ data: { wallet } });
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

  const parsed = unlinkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { message: "walletId is required." } }, { status: 400 });
  }

  const prisma = getPrisma();
  const wallet = await prisma.wallet.findFirst({
    where: { id: parsed.data.walletId, userId: viewer.userId },
  });
  if (!wallet) {
    return NextResponse.json({ error: { message: "Wallet not found." } }, { status: 404 });
  }
  if (viewer.address && wallet.address.toLowerCase() === viewer.address.toLowerCase()) {
    return NextResponse.json(
      { error: { message: "Cannot remove your active signed-in primary wallet." } },
      { status: 400 },
    );
  }

  await prisma.wallet.delete({ where: { id: wallet.id } });
  return NextResponse.json({ data: { removed: wallet.id } });
}
