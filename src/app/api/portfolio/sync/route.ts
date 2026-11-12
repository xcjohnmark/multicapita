import { NextResponse } from "next/server";
import { type Address } from "viem";
import { getViewer } from "@/lib/auth/viewer";
import { isSameOrigin } from "@/lib/http/origin";
import { clientKey, rateLimited } from "@/lib/http/rate-limit";
import { syncWalletPortfolio } from "@/lib/portfolio/sync";

export const dynamic = "force-dynamic";

/**
 * On-demand portfolio balance sync for the authenticated wallet.
 * Triggers concurrent multicall RPC reads across Base and Arbitrum One,
 * fetches spot prices, and writes an immutable PortfolioSnapshot.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: { message: "Cross-origin request refused." } }, { status: 403 });
  }

  if (rateLimited(`portfolio-sync:${clientKey(request)}`, { max: 20 })) {
    return NextResponse.json(
      { error: { message: "Sync request rate limit reached. Please wait a moment." } },
      { status: 429 },
    );
  }

  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json(
      { error: { message: "Sign in with your wallet to synchronize live balances." } },
      { status: 401 },
    );
  }

  if (viewer.demo || !viewer.address) {
    return NextResponse.json(
      { error: { message: "Sync is not available for demo sessions. Connect a real wallet." } },
      { status: 400 },
    );
  }

  try {
    const snapshot = await syncWalletPortfolio(viewer.userId, viewer.address as Address);

    return NextResponse.json({
      ok: true,
      snapshotId: snapshot.id,
      dataMode: snapshot.dataMode,
      totalValueUsd: snapshot.totalValueUsd,
      dataQualityStatus: snapshot.dataQualityStatus,
      observedAt: snapshot.snapshotAt.toISOString(),
      balanceCount: snapshot.balances.length,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          message: err instanceof Error ? err.message : "Failed to sync multi-chain portfolio.",
        },
      },
      { status: 500 },
    );
  }
}
