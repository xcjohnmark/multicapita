import { getPrisma } from "@/lib/db/client";
import { ingestAaveOpportunities } from "./aave";
import { ingestArbitrageOpportunities } from "./arbitrage";
import { ingestEquityOpportunities } from "./equities";
import { ingestPoolOpportunities } from "./pools";
import type { OpportunityInput, SyncResult } from "./types";
import { ingestVaultOpportunities } from "./vaults";

const PROTOCOL_DEFAULTS = [
  {
    slug: "aave-v3",
    name: "Aave V3",
    protocolType: "lending",
    websiteUrl: "https://aave.com",
    docsUrl: "https://aave.com/docs",
    riskNotes: "Variable supply rate; withdrawal liquidity depends on market utilization.",
    isAllowlisted: true,
  },
  {
    slug: "1click-earn",
    name: "1Click Earn",
    protocolType: "vault",
    websiteUrl: "https://intents.near.org",
    docsUrl: "https://docs.agentsonintents.com/integration/distribution-channels/1click-api/earn",
    riskNotes: "Third-party curated vault routed by NEAR Intents. Yield and principal fluctuate.",
    isAllowlisted: true,
  },
  {
    slug: "uniswap-v3",
    name: "Uniswap V3",
    protocolType: "dex",
    websiteUrl: "https://uniswap.org",
    docsUrl: "https://developers.uniswap.org",
    riskNotes: "Concentrated liquidity; stablecoin depeg, out-of-range, and impermanent loss risk.",
    isAllowlisted: true,
  },
  {
    slug: "aerodrome",
    name: "Aerodrome",
    protocolType: "dex",
    websiteUrl: "https://aerodrome.finance",
    docsUrl: "https://aerodrome.finance/docs",
    riskNotes: "Base DEX; non-atomic cross-chain arbitrage and slippage risk.",
    isAllowlisted: true,
  },
  {
    slug: "camelot",
    name: "Camelot DEX",
    protocolType: "dex",
    websiteUrl: "https://camelot.exchange",
    docsUrl: "https://docs.camelot.exchange",
    riskNotes: "Arbitrum DEX; stable pair fee APYs depend on trading volume.",
    isAllowlisted: true,
  },
  {
    slug: "moonwell",
    name: "Moonwell",
    protocolType: "vault",
    websiteUrl: "https://moonwell.fi",
    docsUrl: "https://docs.moonwell.fi",
    riskNotes: "Overcollateralized lending and vault protocol on Base.",
    isAllowlisted: true,
  },
  {
    slug: "ondo",
    name: "Ondo Finance",
    protocolType: "aggregator",
    websiteUrl: "https://ondo.finance",
    docsUrl: "https://docs.ondo.finance",
    riskNotes: "Custody-backed total-return tokenized equity/ETF entitlements; non-voting.",
    isAllowlisted: true,
  },
  {
    slug: "dinari",
    name: "Dinari dShares",
    protocolType: "aggregator",
    websiteUrl: "https://dinari.com",
    docsUrl: "https://docs.dinari.com",
    riskNotes: "1:1 custody-backed tokenized equity shares on Arbitrum One.",
    isAllowlisted: true,
  },
  {
    slug: "tether",
    name: "Tether Gold (XAUT)",
    protocolType: "aggregator",
    websiteUrl: "https://gold.tether.to",
    docsUrl: "https://gold.tether.to",
    riskNotes: "Physical gold-backed RWA token settled via NEAR Intents 1Click on Ethereum.",
    isAllowlisted: true,
  },
];

/**
 * Sync opportunities across all live streams:
 *  1. 1Click Earn Live Vaults
 *  2. Aave V3 Lending Markets
 *  3. Stablecoin Liquidity Pools (live DEX Screener pairs)
 *  4. Cross-Chain Arbitrage (live DEX Screener + 1Click route quotes)
 *  5. Tokenized Equities & RWAs (Yahoo Finance NAV + DEX Screener)
 *
 * Truthfully preserves `c.dataMode` ("live" vs "sample") rather than masking fallbacks as live.
 */
export async function syncOpportunities(): Promise<SyncResult> {
  const prisma = getPrisma();

  const protocolMap = new Map<string, string>();
  for (const p of PROTOCOL_DEFAULTS) {
    const record = await prisma.protocol.upsert({
      where: { slug: p.slug },
      create: p,
      update: {
        name: p.name,
        protocolType: p.protocolType,
        websiteUrl: p.websiteUrl,
        docsUrl: p.docsUrl,
        riskNotes: p.riskNotes,
        isAllowlisted: p.isAllowlisted,
      },
      select: { id: true, slug: true },
    });
    protocolMap.set(record.slug, record.id);
  }

  const [aaveRes, vaultRes, poolRes, arbRes, eqRes] = await Promise.allSettled([
    ingestAaveOpportunities(),
    ingestVaultOpportunities(),
    ingestPoolOpportunities(),
    ingestArbitrageOpportunities(),
    ingestEquityOpportunities(),
  ]);

  const candidates: OpportunityInput[] = [];
  if (aaveRes.status === "fulfilled") candidates.push(...aaveRes.value);
  if (vaultRes.status === "fulfilled") candidates.push(...vaultRes.value);
  if (poolRes.status === "fulfilled") candidates.push(...poolRes.value);
  if (arbRes.status === "fulfilled") candidates.push(...arbRes.value);
  if (eqRes.status === "fulfilled") candidates.push(...eqRes.value);

  const now = new Date();
  const savedOpportunities: SyncResult["opportunities"] = [];

  for (const c of candidates) {
    const protocolId = protocolMap.get(c.protocolSlug);
    if (!protocolId) continue;

    const existing = await prisma.opportunity.findFirst({
      where: {
        strategyType: c.strategyType,
        protocolId,
        chainId: c.chainId,
        tokenOrPairRef: c.tokenOrPairRef,
      },
      select: { id: true },
    });

    const dataPayload = {
      strategyType: c.strategyType,
      protocolId,
      chainId: c.chainId,
      tokenOrPairRef: c.tokenOrPairRef,
      marketOrPoolAddress: c.marketOrPoolAddress ?? null,
      estimatedApy: c.estimatedApy,
      rateType: c.rateType,
      tvlUsd: c.tvlUsd ?? null,
      volume24hUsd: c.volume24hUsd ?? null,
      liquidityUsd: c.liquidityUsd ?? null,
      feesJson: c.feesJson ? JSON.parse(JSON.stringify(c.feesJson)) : null,
      withdrawalJson: c.withdrawalJson ? JSON.parse(JSON.stringify(c.withdrawalJson)) : null,
      riskFlags: c.riskFlags,
      sourcePayload: JSON.parse(JSON.stringify(c.sourcePayload)),
      dataMode: c.dataMode,
      observedAt: c.observedAt ?? now,
      status: c.status,
    };

    const record = existing
      ? await prisma.opportunity.update({
          where: { id: existing.id },
          data: dataPayload,
          select: { id: true },
        })
      : await prisma.opportunity.create({
          data: dataPayload,
          select: { id: true },
        });

    savedOpportunities.push({
      id: record.id,
      strategyType: c.strategyType,
      protocol: c.protocolName,
      chainId: c.chainId,
      tokenOrPairRef: c.tokenOrPairRef,
      estimatedApy: c.estimatedApy,
      rateType: c.rateType,
      dataMode: c.dataMode,
    });
  }

  return {
    syncedCount: savedOpportunities.length,
    liveCount: savedOpportunities.filter((o) => o.dataMode === "live").length,
    observedAt: now.toISOString(),
    opportunities: savedOpportunities,
  };
}
