import { NextResponse } from "next/server";
import { getRoutePreview } from "@/lib/near/route-preview";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Read-only preview of a supported cross-chain route (100 USDC Base -> Arbitrum). */
export async function GET() {
  const preview = await getRoutePreview();
  if (!preview.ok) {
    return NextResponse.json(
      { error: { message: preview.error, correlationId: preview.correlationId } },
      { status: 502 },
    );
  }
  return NextResponse.json({ data: preview });
}
