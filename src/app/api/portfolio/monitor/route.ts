import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth/viewer";
import { clientKey, rateLimited } from "@/lib/http/rate-limit";
import { runPortfolioHealthCheck } from "@/lib/portfolio/monitoring";

export const dynamic = "force-dynamic";

/**
 * Trigger continuous monitoring scan.
 * Can be called by scheduled background jobs or the UI sync button.
 */
export async function POST(request: Request) {
  if (rateLimited(`portfolio-monitor:${clientKey(request)}`, { max: 15 })) {
    return NextResponse.json(
      { error: { message: "Too many monitor trigger requests. Please wait a minute." } },
      { status: 429 },
    );
  }

  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: { message: "Authentication required." } }, { status: 401 });
  }

  try {
    const report = await runPortfolioHealthCheck(viewer.userId);
    return NextResponse.json({
      data: {
        success: true,
        report,
        recordedAlertsCount: report.alerts.length,
      },
      meta: {
        timestamp: report.checkedAt,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: { message: (err as Error).message ?? "Failed to run monitoring scan" } },
      { status: 500 },
    );
  }
}
