import { NextResponse } from "next/server";
import { z } from "zod";
import { getViewer } from "@/lib/auth/viewer";
import { getPrisma } from "@/lib/db/client";
import { isSameOrigin } from "@/lib/http/origin";
import { clientKey, rateLimited } from "@/lib/http/rate-limit";

export const dynamic = "force-dynamic";

const recordSchema = z.object({
  strategyType: z.enum(["lending", "stablecoin_lp", "yield_vault", "tokenized_equity"]),
  protocolSlug: z.string().min(1),
  chainId: z.number().int(),
  positionReference: z.string().min(1),
  amountAtomic: z.string().regex(/^\d+$/),
  valueUsd: z.number().positive(),
  rateValue: z.number().optional(),
  rateType: z.string().optional(),
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  receiptTokenAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
});

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: { message: "Cross-origin request refused." } }, { status: 403 });
  }
  if (rateLimited(`protocols-record:${clientKey(request)}`, { max: 30 })) {
    return NextResponse.json(
      { error: { message: "Too many record requests. Please wait a minute." } },
      { status: 429 },
    );
  }

  const viewer = await getViewer();
  if (!viewer || !viewer.address) {
    return NextResponse.json({ error: { message: "Sign in to record positions." } }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { message: "Invalid JSON body" } }, { status: 400 });
  }

  const parsed = recordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { message: "Invalid position record data", issues: parsed.error.issues } },
      { status: 400 },
    );
  }

  const req = parsed.data;
  const prisma = getPrisma();

  // Find or create the Protocol
  let protocol = await prisma.protocol.findUnique({
    where: { slug: req.protocolSlug },
  });
  if (!protocol) {
    protocol = await prisma.protocol.create({
      data: {
        slug: req.protocolSlug,
        name: req.protocolSlug.toUpperCase(),
        protocolType: req.strategyType,
        isAllowlisted: true,
      },
    });
  }

  // Find or create the receipt token if provided
  let receiptTokenId: string | null = null;
  if (req.receiptTokenAddress) {
    let token = await prisma.token.findUnique({
      where: {
        chainId_contractAddress: {
          chainId: req.chainId,
          contractAddress: req.receiptTokenAddress.toLowerCase(),
        },
      },
    });
    if (!token) {
      token = await prisma.token.create({
        data: {
          chainId: req.chainId,
          contractAddress: req.receiptTokenAddress.toLowerCase(),
          symbol: req.protocolSlug.toUpperCase(),
          decimals: 6,
          verificationStatus: "verified",
        },
      });
    }
    receiptTokenId = token.id;
  }

  // Record Transaction
  await prisma.transaction.upsert({
    where: {
      chainId_txHash: {
        chainId: req.chainId,
        txHash: req.txHash.toLowerCase(),
      },
    },
    create: {
      userId: viewer.userId,
      chainId: req.chainId,
      txHash: req.txHash.toLowerCase(),
      transactionType: req.strategyType === "lending" ? "supply" : "add_liquidity",
      fromAddress: viewer.address.toLowerCase(),
      status: "confirmed",
      confirmedAt: new Date(),
    },
    update: {
      status: "confirmed",
      confirmedAt: new Date(),
    },
  });

  // Find or create Position
  const existingPosition = await prisma.position.findFirst({
    where: {
      userId: viewer.userId,
      protocolId: protocol.id,
      chainId: req.chainId,
      positionReference: req.positionReference,
      status: "open",
    },
  });

  let positionId: string;
  const now = new Date();

  if (existingPosition) {
    const updated = await prisma.position.update({
      where: { id: existingPosition.id },
      data: {
        currentValueUsd: (existingPosition.currentValueUsd ?? 0) + req.valueUsd,
        lastSyncedAt: now,
      },
    });
    positionId = updated.id;
  } else {
    const created = await prisma.position.create({
      data: {
        userId: viewer.userId,
        strategyType: req.strategyType,
        protocolId: protocol.id,
        chainId: req.chainId,
        positionReference: req.positionReference,
        receiptTokenId,
        initialDepositUsd: req.valueUsd,
        currentValueUsd: req.valueUsd,
        accruedReturnUsd: 0,
        unrealisedPnlUsd: 0,
        status: "open",
        openedAt: now,
        lastSyncedAt: now,
      },
    });
    positionId = created.id;
  }

  // Create Snapshot
  await prisma.positionSnapshot.create({
    data: {
      positionId,
      snapshotAt: now,
      valueUsd: req.valueUsd,
      rateValue: req.rateValue ?? null,
      rateType: req.rateType ?? null,
      feesEarnedUsd: 0,
      rewardsEarnedUsd: 0,
      pnlUsd: 0,
      sourceMetadata: {
        txHash: req.txHash,
        amountAtomic: req.amountAtomic,
      },
    },
  });

  // Create Audit Event
  await prisma.auditEvent.create({
    data: {
      userId: viewer.userId,
      eventType: "position.recorded",
      actorType: "user",
      referenceId: positionId,
      details: {
        strategyType: req.strategyType,
        protocolSlug: req.protocolSlug,
        chainId: req.chainId,
        txHash: req.txHash,
        valueUsd: req.valueUsd,
      },
    },
  });

  return NextResponse.json({
    data: {
      ok: true,
      positionId,
      message: "Position and snapshot recorded successfully.",
    },
  });
}
