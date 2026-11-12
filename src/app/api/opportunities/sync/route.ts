import { NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/http/origin";
import { clientKey, rateLimited } from "@/lib/http/rate-limit";
import { syncOpportunities } from "@/lib/opportunities/ingestion";

export const dynamic = "force-dynamic";

/**
 * Trigger live DeFi market opportunity scan across:
 *  - 1Click Earn Live Vaults (Morpho, Spark, Moonwell)
 *  - Aave V3 Lending Markets on Base & Arbitrum (on-chain RPC)
 *  - Stablecoin Liquidity Pools (Uniswap V3, Aerodrome, Camelot)
 *  - Cross-Chain Arbitrage (deterministic net profit)
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: { message: "Cross-origin request refused." } }, { status: 403 });
  }

  if (rateLimited(`opps-sync:${clientKey(request)}`, { max: 15 })) {
    return NextResponse.json(
      { error: { message: "Opportunity sync rate limit reached. Please wait a moment." } },
      { status: 429 },
    );
  }

  try {
    const result = await syncOpportunities();
    return NextResponse.json({ data: result });
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          message: err instanceof Error ? err.message : "Failed to sync live opportunities.",
        },
      },
      { status: 500 },
    );
  }
}
