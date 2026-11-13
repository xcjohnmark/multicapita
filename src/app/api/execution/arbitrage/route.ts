import { NextResponse } from "next/server";
import { ingestArbitrageOpportunities, MIN_ARBITRAGE_PROFIT_USD } from "@/lib/opportunities/arbitrage";
import { clientKey, rateLimited } from "@/lib/http/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Live 2-leg Cross-Chain Arbitrage spread scanner endpoint for /execute.
 * Pulls live DEX Screener Base vs Arbitrum quotes + live 1Click bridge quote cost.
 */
export async function GET(request: Request) {
  if (rateLimited(`arb-scan:${clientKey(request)}`, { max: 20 })) {
    return NextResponse.json(
      { error: { message: "Too many arbitrage quote requests. Wait a moment." } },
      { status: 429 },
    );
  }

  try {
    const opportunities = await ingestArbitrageOpportunities();
    return NextResponse.json({
      ok: true,
      observedAt: new Date().toISOString(),
      minProfitUsd: MIN_ARBITRAGE_PROFIT_USD,
      opportunities: opportunities.map((opp) => ({
        asset: opp.tokenOrPairRef,
        sourceChainId: opp.chainId,
        estimatedApy: opp.estimatedApy,
        rateType: opp.rateType,
        liquidityUsd: opp.liquidityUsd,
        dataMode: opp.dataMode,
        status: opp.status,
        riskFlags: opp.riskFlags,
        fees: opp.feesJson,
        sourcePayload: opp.sourcePayload,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          message: err instanceof Error ? err.message : "Failed to scan live arbitrage spreads.",
        },
      },
      { status: 502 },
    );
  }
}
