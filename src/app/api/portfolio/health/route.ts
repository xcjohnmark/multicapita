import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth/viewer";
import { clientKey, rateLimited } from "@/lib/http/rate-limit";
import { runPortfolioHealthCheck } from "@/lib/portfolio/monitoring";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (rateLimited(`portfolio-health:${clientKey(request)}`, { max: 30 })) {
    return NextResponse.json(
      { error: { message: "Too many health requests. Please wait a minute." } },
      { status: 429 },
    );
  }

  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: { message: "Sign in to check portfolio health." } }, { status: 401 });
  }

  try {
    const report = await runPortfolioHealthCheck(viewer.userId);
    return NextResponse.json({
      data: report,
      meta: {
        source: "live multi-chain RPC & price feeds",
        timestamp: report.checkedAt,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: { message: (err as Error).message ?? "Health monitoring check failed" } },
      { status: 500 },
    );
  }
}
