import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db/client";
import { env, hasAiCredentials } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Liveness + configuration report. Never exposes secret values, only presence. */
export async function GET() {
  let db: "ok" | "error" = "ok";
  let dbError: string | undefined;

  try {
    await getPrisma().$queryRaw`SELECT 1`;
  } catch (error) {
    db = "error";
    dbError = error instanceof Error ? error.message : "unknown database error";
  }

  return NextResponse.json(
    {
      data: {
        status: db === "ok" ? "ok" : "degraded",
        database: { status: db, error: dbError },
        dataMode: env.APP_DATA_MODE,
        ai: { configured: hasAiCredentials, model: env.NEAR_AI_MODEL },
        oneClick: { authenticated: Boolean(env.ONECLICK_JWT) },
      },
    },
    { status: db === "ok" ? 200 : 503 },
  );
}
