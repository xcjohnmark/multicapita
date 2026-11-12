import { NextResponse } from "next/server";
import { SUPPORTED_CHAINS } from "@/lib/chains";
import { getClient } from "@/lib/near/registry";
import { OneClickError } from "@/lib/near/oneclick";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Live 1Click asset catalogue, filtered to the chains this MVP supports.
 * Cached in-process for 5 minutes by the client; `fetchedAt` is exposed so the UI can
 * show real freshness instead of pretending data is always instant.
 */
export async function GET() {
  try {
    const { tokens, fetchedAt } = await getClient().getTokens();

    const supported = tokens.filter((token) =>
      SUPPORTED_CHAINS.some((chain) => chain.oneClickBlockchain === token.blockchain),
    );

    return NextResponse.json({
      data: {
        tokens: supported,
        supportedChains: SUPPORTED_CHAINS.map((c) => ({ id: c.id, name: c.name })),
        totalCatalogueSize: tokens.length,
        catalogueChainCount: new Set(tokens.map((t) => t.blockchain)).size,
      },
      meta: {
        source: "1click" as const,
        fetchedAt: new Date(fetchedAt).toISOString(),
      },
    });
  } catch (error) {
    const message = error instanceof OneClickError ? error.message : "Failed to load catalogue";
    return NextResponse.json(
      { error: { message, correlationId: (error as OneClickError)?.correlationId } },
      { status: 502 },
    );
  }
}
