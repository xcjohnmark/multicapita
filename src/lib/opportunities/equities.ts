import {
  evaluateEquityPriceProvenance,
  fetchLiveEquityDualQuote,
  VERIFIED_TOKENIZED_ASSETS,
} from "@/lib/protocols/equities";
import type { OpportunityInput } from "./types";

/**
 * Live Tokenized Equities & Real-World Assets (RWA) Opportunity Ingestion.
 *
 * Fetches TradFi Reference NAV (Yahoo Finance) paired with on-chain DEX price/liquidity
 * (DEX Screener) for RPC/catalogue-verified tokenized stocks & XAUT.
 * Never invents missing DEX liquidity or upgrades unpriced feeds to `dataMode: "live"`.
 */

export async function ingestEquityOpportunities(): Promise<OpportunityInput[]> {
  const results: OpportunityInput[] = [];
  const quotes = await Promise.all(VERIFIED_TOKENIZED_ASSETS.map(fetchLiveEquityDualQuote));

  for (const q of quotes) {
    const { asset } = q;
    const isCommodity = asset.wrapperType === "physical_commodity";
    const evalRes = evaluateEquityPriceProvenance({
      dexPriceUsd: q.dexPriceUsd,
      referenceNavUsd: q.referenceNavUsd,
      maxNavDeviationBps: 150,
      allowOffHoursExecution: isCommodity,
      isCommodity,
    });

    const isLive = q.referenceNavUsd !== null || q.dexPriceUsd !== null;
    // Only a pair of real prices yields a spread. The evaluator reports 9999 bps when either price
    // is missing; that is a refusal marker, not a measurement, so it is never stored as a figure.
    const priced =
      q.dexPriceUsd !== null && q.dexPriceUsd > 0 && q.referenceNavUsd !== null && q.referenceNavUsd > 0;
    const navDeviationBps = priced ? evalRes.provenance.navDeviationBps : null;
    const riskFlags: string[] = ["issuer_counterparty_risk"];
    if (evalRes.provenance.sessionStatus === "CLOSED" && !isCommodity) {
      riskFlags.push("us_market_closed");
    }
    if (navDeviationBps !== null && !evalRes.provenance.isWithinSpreadBound) {
      riskFlags.push(`nav_spread_${navDeviationBps}_bps`);
    }
    if (q.dexPriceUsd === null) {
      riskFlags.push(
        asset.oneClickAssetId ? "route_via_1click" : "issuer_orderbook_only",
      );
    }

    results.push({
      strategyType: "tokenized_equity",
      protocolSlug: asset.issuer.toLowerCase(),
      protocolName: `${asset.issuer} (${asset.symbol})`,
      protocolType: "aggregator",
      websiteUrl:
        asset.issuer === "Ondo"
          ? "https://ondo.finance"
          : asset.issuer === "Dinari"
            ? "https://dinari.com"
            : "https://gold.tether.to",
      docsUrl: "https://docs.ondo.finance",
      riskNotes: `Custody-backed ${asset.wrapperType.replaceAll("_", " ")}. Non-voting entitlement subject to issuer allowlist/jurisdiction rules.`,
      chainId: asset.chainId,
      tokenOrPairRef: `${asset.symbol} (${asset.underlyingTicker})`,
      marketOrPoolAddress: asset.contractAddress,
      // A tokenized stock has no yield. The NAV spread lives in feesJson/sourcePayload; putting it
      // in estimatedApy would let the planner rank a price gap as if it were an APY.
      estimatedApy: null,
      rateType: "reference_nav_exposure",
      tvlUsd: q.dexLiquidityUsd ?? undefined,
      liquidityUsd: q.dexLiquidityUsd ?? undefined,
      feesJson: {
        navDeviationBps,
        referenceNavUsd: q.referenceNavUsd,
        dexExecutionPriceUsd: q.dexPriceUsd,
        sessionStatus: evalRes.provenance.sessionStatus,
      },
      withdrawalJson: {
        immediate: true,
        wrapperType: asset.wrapperType,
        oneClickAssetId: asset.oneClickAssetId ?? null,
      },
      riskFlags,
      sourcePayload: {
        provider: `${q.referenceSource}+${q.dexSource}`,
        referenceNavUsd: q.referenceNavUsd,
        dexPriceUsd: q.dexPriceUsd,
        navDeviationBps,
        sessionStatus: evalRes.provenance.sessionStatus,
        underlyingTicker: asset.underlyingTicker,
        issuer: asset.issuer,
        oneClickAssetId: asset.oneClickAssetId ?? null,
      },
      dataMode: isLive ? "live" : "sample",
      observedAt: new Date(q.observedAt),
      status: isLive ? "active" : "unsupported",
    });
  }

  return results;
}
