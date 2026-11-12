import { getPrisma } from "@/lib/db/client";
import { ingestAaveOpportunities } from "./aave";
import { ingestArbitrageOpportunities } from "./arbitrage";
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
];

/**
 * Sync and ingest live opportunities across all 4 core strategies:
 *  1. 1Click Earn Live Vaults (Gauntlet Morpho, Spark, Moonwell)
 *  2. Aave V3 Lending Markets (on-chain Ray -> APY conversion on Base & Arbitrum)
 *  3. Stablecoin Liquidity Pools (Uniswap V3 & Aerodrome)
 *  4. Cross-Chain Arbitrage (deterministic net profit with 1Click bridge fees)
 */
export async function syncOpportunities(): Promise<SyncResult> {
  const prisma = getPrisma();

  // 1. Ensure all protocols exist in DB
  const protocolMap = new Map<string, string>(); // slug -> id
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

  // 2. Fetch all 4 opportunity streams concurrently
  const [aaveRes, vaultRes, poolRes, arbRes] = await Promise.allSettled([
    ingestAaveOpportunities(),
    ingestVaultOpportunities(),
    ingestPoolOpportunities(),
    ingestArbitrageOpportunities(),
  ]);

  const candidates: OpportunityInput[] = [];
  if (aaveRes.status === "fulfilled") candidates.push(...aaveRes.value);
  if (vaultRes.status === "fulfilled") candidates.push(...vaultRes.value);
  if (poolRes.status === "fulfilled") candidates.push(...poolRes.value);
  if (arbRes.status === "fulfilled") candidates.push(...arbRes.value);

  // 3. Upsert opportunities into DB with dataMode: "live"
  const now = new Date();
  const savedOpportunities: Array<{
    id: string;
    strategyType: string;
    protocol: string;
    chainId: number;
    tokenOrPairRef: string;
    estimatedApy: number | null;
    rateType: string | null;
    dataMode: string;
  }> = [];

  for (const c of candidates) {
    const protocolId = protocolMap.get(c.protocolSlug);
    if (!protocolId) continue;

    // Search for existing opportunity matching strategy, protocol, chain, and pair
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
      dataMode: "live",
      observedAt: now,
      status: c.status,
    };

    let oppId: string;
    if (existing) {
      const updated = await prisma.opportunity.update({
        where: { id: existing.id },
        data: dataPayload,
        select: { id: true },
      });
      oppId = updated.id;
    } else {
      const created = await prisma.opportunity.create({
        data: dataPayload,
        select: { id: true },
      });
      oppId = created.id;
    }

    savedOpportunities.push({
      id: oppId,
      strategyType: c.strategyType,
      protocol: c.protocolName,
      chainId: c.chainId,
      tokenOrPairRef: c.tokenOrPairRef,
      estimatedApy: c.estimatedApy,
      rateType: c.rateType,
      dataMode: "live",
    });
  }

  return {
    syncedCount: savedOpportunities.length,
    liveCount: savedOpportunities.filter((o) => o.dataMode === "live").length,
    observedAt: now.toISOString(),
    opportunities: savedOpportunities,
  };
}
