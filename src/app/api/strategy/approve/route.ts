import { NextResponse } from "next/server";
import { z } from "zod";
import { getViewer } from "@/lib/auth/viewer";
import { getPrisma } from "@/lib/db/client";
import { isSameOrigin } from "@/lib/http/origin";
import { clientKey, rateLimited } from "@/lib/http/rate-limit";

export const dynamic = "force-dynamic";

const approveSchema = z.object({
  proposalId: z.string().trim().min(1),
});

export type StagedLegLink = {
  allocationId: string;
  step: number;
  label: string;
  chainId: number;
  amountUsd: number;
  href: string;
};

function buildLegHref(leg: {
  strategyType: string;
  chainId: number;
  amountUsd: number;
  protocolSlug: string;
  assetLabel: string;
}): string {
  const amt = Math.max(1, Math.round(leg.amountUsd));
  if (leg.strategyType === "lending" || leg.protocolSlug === "aave-v3") {
    return `/execute?tab=aave_supply&chain=${leg.chainId}&amount=${amt}`;
  }
  if (leg.strategyType === "stablecoin_lp" || leg.protocolSlug.includes("uniswap")) {
    return `/execute?tab=uniswap_lp&chain=${leg.chainId}&amount=${amt}`;
  }
  if (leg.strategyType === "tokenized_equity") {
    const tickerMatch = leg.assetLabel.match(/^([A-Za-z0-9.]+)/);
    const ticker = tickerMatch ? tickerMatch[1] : "";
    const qs = new URLSearchParams({ tab: "equities", chain: String(leg.chainId), amount: String(amt) });
    if (ticker) qs.set("symbol", ticker);
    return `/execute?${qs.toString()}`;
  }
  if (leg.strategyType === "arbitrage") {
    return `/execute?tab=arbitrage&amount=${amt}`;
  }
  const direction = leg.chainId === 42161 ? "base-to-arb" : "arb-to-base";
  return `/execute?direction=${direction}&amount=${amt}`;
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: { message: "Cross-origin request refused." } }, { status: 403 });
  }
  if (rateLimited(`strategy-approve:${clientKey(request)}`, { max: 20 })) {
    return NextResponse.json(
      { error: { message: "Too many approval requests. Wait a moment." } },
      { status: 429 },
    );
  }

  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: { message: "Sign in to approve a strategy." } }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { message: "Invalid JSON body." } }, { status: 400 });
  }

  const parsed = approveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { message: "Valid proposalId is required." } }, { status: 400 });
  }

  const prisma = getPrisma();
  const proposal = await prisma.strategyProposal.findFirst({
    where: { id: parsed.data.proposalId, userId: viewer.userId },
    include: {
      allocations: {
        include: { protocol: true, opportunity: true },
        orderBy: { amountUsdEstimate: "desc" },
      },
    },
  });

  if (!proposal) {
    return NextResponse.json({ error: { message: "Strategy proposal not found." } }, { status: 404 });
  }

  if (proposal.validationStatus !== "validated" || proposal.allocations.length === 0) {
    return NextResponse.json(
      {
        error: {
          message:
            "Only policy-validated proposals with at least one allocated leg can be approved.",
        },
      },
      { status: 400 },
    );
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.strategyProposal.update({
      where: { id: proposal.id },
      data: { status: "approved", approvedAt: now },
    });

    await tx.strategyAllocation.updateMany({
      where: { proposalId: proposal.id, executionStatus: "planned" },
      data: { executionStatus: "approved" },
    });

    await tx.auditEvent.create({
      data: {
        userId: viewer.userId,
        eventType: "strategy.approved",
        actorType: "user",
        referenceId: proposal.id,
        details: {
          legCount: proposal.allocations.length,
          approvedAt: now.toISOString(),
          demoSession: viewer.demo,
        },
      },
    });
  });

  const stageLinks: StagedLegLink[] = proposal.allocations.map((alloc, index) => {
    const assetLabel = alloc.opportunity?.tokenOrPairRef ?? alloc.strategyType;
    const amountUsd = alloc.amountUsdEstimate ?? 0;
    return {
      allocationId: alloc.id,
      step: index + 1,
      label: `${alloc.protocol.name} · ${assetLabel}`,
      chainId: alloc.chainId,
      amountUsd,
      href: buildLegHref({
        strategyType: alloc.strategyType,
        chainId: alloc.chainId,
        amountUsd,
        protocolSlug: alloc.protocol.slug,
        assetLabel,
      }),
    };
  });

  return NextResponse.json({
    ok: true,
    data: {
      proposalId: proposal.id,
      status: "approved",
      approvedAt: now.toISOString(),
      stageLinks,
    },
  });
}
