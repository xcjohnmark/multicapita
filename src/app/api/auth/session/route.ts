import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth/viewer";
import { env } from "@/lib/env";
import { isSessionConfigured } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * Current viewer and the execution capability envelope.
 *
 * Reports presence, never secrets. The UI uses this to decide whether to offer a signature step,
 * and to label a demo session as a demo session.
 */
export async function GET() {
  const viewer = await getViewer();

  return NextResponse.json(
    {
      data: {
        authenticated: Boolean(viewer && !viewer.demo),
        demo: viewer?.demo ?? false,
        userId: viewer?.userId ?? null,
        address: viewer?.address ?? null,
        email: viewer?.email ?? null,
        dataMode: env.APP_DATA_MODE,
        session: { configured: isSessionConfigured() },
        execution: {
          enabled: env.APP_DATA_MODE === "live" && !env.EXECUTION_DISABLED,
          liveMode: env.APP_DATA_MODE === "live",
          killSwitch: env.EXECUTION_DISABLED,
          maxMoveUsdc: env.EXECUTION_MAX_MOVE_USDC,
          maxDailyUsdc: env.EXECUTION_MAX_DAILY_USDC,
          requiresSignature: true,
          requiresApproval: true,
        },
      },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
