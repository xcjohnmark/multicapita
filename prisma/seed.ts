/**
 * Seeds a clearly-labelled SAMPLE portfolio so the product is explorable without a wallet
 * or funds. Every seeded row carries dataMode = "sample" and the UI shows it as such.
 *
 * Run: npm run db:seed
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { DEMO_USER_EMAIL } from "../src/lib/auth/demo-user";
import { resolveDatabaseUrl } from "../src/lib/db/database-url";

const adapter = new PrismaPg({ connectionString: resolveDatabaseUrl() });
const prisma = new PrismaClient({ adapter });

const BASE_USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const ARB_USDC = "0xaf88d065e77c8cc2239327c5edb3a432268e5831";
const BASE_WETH = "0x4200000000000000000000000000000000000006";
const BASE_GTUSDCP = "0x0bb69b79bc829e1cfcc34a740110886d98d2bd14";

const DEMO_ADDRESS = "0x000000000000000000000000000000000000dEaD";

async function main() {
  // Idempotent: clear previous demo rows in dependency order.
  await prisma.executionStep.deleteMany();
  await prisma.executionPlan.deleteMany();
  await prisma.opportunityObservation.deleteMany();
  await prisma.positionSnapshot.deleteMany();
  await prisma.position.deleteMany();
  await prisma.quote.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.strategyAllocation.deleteMany();
  await prisma.strategyProposal.deleteMany();
  await prisma.strategyConstraint.deleteMany();
  await prisma.strategyProfile.deleteMany();
  await prisma.tokenBalance.deleteMany();
  await prisma.portfolioSnapshot.deleteMany();
  await prisma.opportunity.deleteMany();
  await prisma.protocol.deleteMany();
  await prisma.token.deleteMany();
  await prisma.wallet.deleteMany();
  await prisma.auditEvent.deleteMany();
  await prisma.user.deleteMany();
  await prisma.chain.deleteMany();

  await prisma.chain.createMany({
    data: [
      { chainId: 8453, slug: "base", name: "Base", ecosystem: "evm" },
      { chainId: 42161, slug: "arbitrum", name: "Arbitrum One", ecosystem: "evm" },
    ],
  });

  const usdcBase = await prisma.token.create({
    data: {
      chainId: 8453,
      contractAddress: BASE_USDC,
      assetId: "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near",
      symbol: "USDC",
      name: "USD Coin",
      decimals: 6,
      canonicalAssetId: "usd-coin",
      verificationStatus: "catalogue",
      metadataSource: "1click /v0/tokens",
    },
  });

  const usdcArb = await prisma.token.create({
    data: {
      chainId: 42161,
      contractAddress: ARB_USDC,
      assetId: "nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near",
      symbol: "USDC",
      name: "USD Coin",
      decimals: 6,
      canonicalAssetId: "usd-coin",
      verificationStatus: "catalogue",
      metadataSource: "1click /v0/tokens",
    },
  });

  const wethBase = await prisma.token.create({
    data: {
      chainId: 8453,
      contractAddress: BASE_WETH,
      symbol: "WETH",
      name: "Wrapped Ether",
      decimals: 18,
      verificationStatus: "unverified",
      metadataSource: "local registry",
    },
  });

  const gtusdcp = await prisma.token.create({
    data: {
      chainId: 8453,
      contractAddress: BASE_GTUSDCP,
      assetId: "nep141:base-0x0bb69b79bc829e1cfcc34a740110886d98d2bd14.omft.near",
      symbol: "gtUSDCp",
      name: "Gauntlet USDC Prime (Morpho) receipt",
      decimals: 18,
      verificationStatus: "catalogue",
      metadataSource: "1click /v0/tokens",
    },
  });

  const aave = await prisma.protocol.create({
    data: {
      slug: "aave-v3",
      name: "Aave V3",
      protocolType: "lending",
      websiteUrl: "https://aave.com",
      docsUrl: "https://aave.com/docs",
      riskNotes: "Variable supply rate; withdrawal depends on market liquidity.",
      isAllowlisted: true,
    },
  });

  const uniswap = await prisma.protocol.create({
    data: {
      slug: "uniswap-v3",
      name: "Uniswap V3",
      protocolType: "dex",
      websiteUrl: "https://uniswap.org",
      docsUrl: "https://developers.uniswap.org",
      riskNotes: "Concentrated liquidity; stablecoin depeg and out-of-range risk.",
      isAllowlisted: true,
    },
  });

  const earn = await prisma.protocol.create({
    data: {
      slug: "1click-earn",
      name: "1Click Earn",
      protocolType: "vault",
      websiteUrl: "https://intents.near.org",
      docsUrl: "https://docs.agentsonintents.com/integration/distribution-channels/1click-api/earn",
      riskNotes: "Third-party vault routed by NEAR Intents. Yield and principal not guaranteed.",
      isAllowlisted: true,
    },
  });

  const aerodrome = await prisma.protocol.create({
    data: {
      slug: "aerodrome",
      name: "Aerodrome",
      protocolType: "dex",
      websiteUrl: "https://aerodrome.finance",
      docsUrl: "https://aerodrome.finance/docs",
      riskNotes: "Base DEX; non-atomic cross-chain arbitrage leg.",
      isAllowlisted: true,
    },
  });

  const now = new Date();

  await prisma.opportunity.createMany({
    data: [
      {
        strategyType: "lending",
        protocolId: aave.id,
        chainId: 8453,
        tokenOrPairRef: "USDC",
        marketOrPoolAddress: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5",
        estimatedApy: 4.82,
        rateType: "APY",
        tvlUsd: 120_400_000,
        liquidityUsd: 18_200_000,
        dataMode: "sample",
        observedAt: now,
        status: "active",
        riskFlags: ["variable_rate", "withdrawal_liquidity"],
        sourcePayload: { provider: "sample fixture", note: "not live market data" },
      },
      {
        strategyType: "lending",
        protocolId: aave.id,
        chainId: 42161,
        tokenOrPairRef: "USDC",
        marketOrPoolAddress: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5",
        estimatedApy: 5.31,
        rateType: "APY",
        tvlUsd: 88_700_000,
        liquidityUsd: 9_400_000,
        dataMode: "sample",
        observedAt: now,
        status: "active",
        riskFlags: ["variable_rate"],
        sourcePayload: { provider: "sample fixture", note: "not live market data" },
      },
      {
        strategyType: "yield_vault",
        protocolId: earn.id,
        chainId: 8453,
        tokenOrPairRef: "USDC → gtUSDCp",
        marketOrPoolAddress: BASE_GTUSDCP,
        estimatedApy: 5.1,
        rateType: "APY",
        tvlUsd: 24_100_000,
        dataMode: "sample",
        observedAt: now,
        status: "active",
        riskFlags: ["share_price_changes", "third_party_vault"],
        sourcePayload: { provider: "sample fixture", note: "APY requires Yield.xyz; not live" },
      },
      {
        strategyType: "stablecoin_lp",
        protocolId: uniswap.id,
        chainId: 8453,
        tokenOrPairRef: "USDC/USDT 0.01%",
        marketOrPoolAddress: "0xd0b53d9277642d899df5c87a3966a349a798f224",
        estimatedApy: 6.15,
        rateType: "APY",
        tvlUsd: 31_600_000,
        volume24hUsd: 4_200_000,
        dataMode: "sample",
        observedAt: now,
        status: "active",
        riskFlags: ["stablecoin_depeg", "concentrated_liquidity"],
        sourcePayload: { provider: "sample fixture", note: "not live market data" },
        feesJson: { feeTier: 100 },
      },
      {
        strategyType: "arbitrage",
        protocolId: aerodrome.id,
        chainId: 8453,
        tokenOrPairRef: "WETH Base (Aerodrome) → Arbitrum (Uniswap)",
        marketOrPoolAddress: BASE_WETH,
        estimatedApy: null,
        rateType: "estimated_net_trade_profit",
        tvlUsd: 14_500_000,
        liquidityUsd: 2_100_000,
        dataMode: "sample",
        observedAt: now,
        status: "active",
        riskFlags: ["cross_chain_delay", "execution_price_slippage", "non_atomic"],
        sourcePayload: {
          provider: "sample fixture",
          buyVenue: "Aerodrome (Base)",
          sellVenue: "Uniswap V3 (Arbitrum)",
          expectedProfitUsd: 12.4,
          grossSpreadBps: 85,
          netSpreadBps: 42,
          gasEstimateUsd: 1.8,
          bridgeEstimateUsd: 0.25,
          tradeSizeUsd: 2500,
          note: "Trade-size specific executable quote required before signing",
        },
      },
    ],
  });

  const moonwell = await prisma.protocol.create({
    data: { slug: "moonwell", name: "Moonwell", protocolType: "vault", websiteUrl: "https://moonwell.fi", docsUrl: "https://docs.moonwell.fi", riskNotes: "Overcollateralized lending and vault protocol on Base.", isAllowlisted: true },
  });
  const ondo = await prisma.protocol.create({
    data: { slug: "ondo", name: "Ondo Finance", protocolType: "aggregator", websiteUrl: "https://ondo.finance", docsUrl: "https://docs.ondo.finance", riskNotes: "Custody-backed tokenized equity entitlements; non-voting.", isAllowlisted: true },
  });
  const dinari = await prisma.protocol.create({
    data: { slug: "dinari", name: "Dinari dShares", protocolType: "aggregator", websiteUrl: "https://dinari.com", docsUrl: "https://docs.dinari.com", riskNotes: "1:1 custody-backed tokenized shares on Arbitrum One.", isAllowlisted: true },
  });
  const tether = await prisma.protocol.create({
    data: { slug: "tether", name: "Tether Gold (XAUT)", protocolType: "aggregator", websiteUrl: "https://gold.tether.to", docsUrl: "https://gold.tether.to", riskNotes: "Physical gold-backed token.", isAllowlisted: true },
  });

  const SAMPLE = { provider: "sample fixture", note: "not live market data" };
  await prisma.opportunity.createMany({
    data: [
      // Vault addresses are the verified ones in src/lib/opportunities/vaults.ts; rates are fixtures.
      { strategyType: "yield_vault", protocolId: earn.id, chainId: 8453, tokenOrPairRef: "USDC → sparkUSDC", marketOrPoolAddress: "0x7bfa7c4f149e7415b73bded8f86d209f99b54846", estimatedApy: 4.04, rateType: "APY", tvlUsd: 353_000_000, dataMode: "sample", observedAt: now, status: "active", riskFlags: ["share_price_changes", "third_party_vault"], sourcePayload: SAMPLE },
      { strategyType: "yield_vault", protocolId: moonwell.id, chainId: 8453, tokenOrPairRef: "USDC → mwUSDC", marketOrPoolAddress: "0xedc817a28e8b93b03976fbd4a3ddbc9f7d176c22", estimatedApy: 5.2, rateType: "APY", tvlUsd: 85_000_000, dataMode: "sample", observedAt: now, status: "active", riskFlags: ["share_price_changes"], sourcePayload: SAMPLE },
      { strategyType: "stablecoin_lp", protocolId: aerodrome.id, chainId: 8453, tokenOrPairRef: "EURC / USDC 0.01%", marketOrPoolAddress: "0x6eaec4f69c92bd16a4b018ceb6fe7a446a113598", estimatedApy: 3.4, rateType: "APR", tvlUsd: 348_000, volume24hUsd: 3_200_000, dataMode: "sample", observedAt: now, status: "active", riskFlags: ["stablecoin_depeg", "concentrated_liquidity"], sourcePayload: SAMPLE },
      // Tokenized assets: contracts from VERIFIED_TOKENIZED_ASSETS; prices are labelled fixtures.
      ...[
        { protocolId: ondo.id, chainId: 1, ref: "NVDAon", address: "0x2D1F7226Bd1F780AF6B9A49DCC0aE00E8Df4bDEE", nav: 180, spread: 35 },
        { protocolId: ondo.id, chainId: 1, ref: "AAPLon", address: "0x14c3abF94bcC9698967923418526543Cb87b2d4c", nav: 230, spread: 28 },
        { protocolId: tether.id, chainId: 1, ref: "XAUT", address: "0x68749665FF8D2d112Fa859AA293F07A622782F38", nav: 3300, spread: 12 },
        { protocolId: dinari.id, chainId: 42161, ref: "NVDA.d", address: "0x4DaFFfDDEa93DdF1e0e7B61E844331455053Ce5c", nav: 180, spread: 44 },
        { protocolId: dinari.id, chainId: 42161, ref: "AAPL.d", address: "0xCe38e140fC3982a6bCEbc37b040913EF2Cd6C5a7", nav: 230, spread: 51 },
      ].map((asset) => ({
        strategyType: "tokenized_equity",
        protocolId: asset.protocolId,
        chainId: asset.chainId,
        tokenOrPairRef: asset.ref,
        marketOrPoolAddress: asset.address,
        estimatedApy: null,
        rateType: "reference_nav_exposure",
        liquidityUsd: 2_000_000,
        dataMode: "sample",
        observedAt: now,
        status: "active",
        riskFlags: ["issuer_orderbook_only"],
        sourcePayload: { ...SAMPLE, referenceNavUsd: asset.nav, dexPriceUsd: asset.nav * (1 + asset.spread / 10_000), navDeviationBps: asset.spread },
      })),
    ],
  });

  // Sample rate history so sparklines render offline. Labelled sample; never shown as live.
  const rated = await prisma.opportunity.findMany({ where: { estimatedApy: { not: null } }, select: { id: true, estimatedApy: true, tvlUsd: true } });
  for (const row of rated) {
    await prisma.opportunityObservation.createMany({
      data: Array.from({ length: 10 }, (_, i) => ({
        opportunityId: row.id,
        observedAt: new Date(now.getTime() - (9 - i) * 6 * 60 * 60 * 1000),
        rate: Number(((row.estimatedApy ?? 0) * (0.92 + 0.08 * Math.sin(i / 1.7) + i * 0.006)).toFixed(3)),
        tvlUsd: row.tvlUsd,
        source: "sample fixture",
        dataMode: "sample",
      })),
    });
  }

  const user = await prisma.user.create({ data: { email: DEMO_USER_EMAIL } });

  // A real, database-backed guardrail set — not the in-code defaults. The policy engine reads
  // these rows, so editing them changes what the demo permits.
  await prisma.strategyProfile.create({
    data: {
      userId: user.id,
      name: "Stablecoin mandate (sample)",
      objective:
        "Earn stablecoin yield across Base and Arbitrum without losing liquidity or over-concentrating in one protocol.",
      isActive: true,
      constraints: {
        create: {
          minLiquidPercent: 30,
          maxProtocolExposurePercent: 40,
          // The mandate is stablecoins only, so a per-asset cap would be 100% by construction.
          // Concentration risk is controlled per protocol, chain and strategy instead.
          maxAssetExposurePercent: 100,
          // The seeded portfolio is already 87% on Base; 95% keeps a real headroom limit without
          // making every plan an immediate violation.
          maxChainExposurePercent: 95,
          maxStrategyExposurePercent: 60,
          maxSlippageBps: 100,
          maxGasUsd: 25,
          minArbitrageProfitUsd: 5,
          approvedChainIds: [8453, 42161],
          requiresUserApproval: true,
        },
      },
    },
  });

  const wallet = await prisma.wallet.create({
    data: {
      userId: user.id,
      address: DEMO_ADDRESS,
      chainFamily: "evm",
      chainId: 8453,
      label: "Demo wallet (not a real account)",
    },
  });

  const snapshot = await prisma.portfolioSnapshot.create({
    data: {
      userId: user.id,
      snapshotAt: now,
      dataMode: "sample",
      dataQualityStatus: "complete",
      notes: "Seeded demo portfolio. Not read from a wallet.",
      totalValueUsd: 11_682.15,
      balances: {
        create: [
          {
            walletId: wallet.id,
            tokenId: usdcBase.id,
            amountAtomic: "4200000000",
            amountDisplay: 4200,
            priceUsd: 0.999,
            valueUsd: 4195.8,
            priceSource: "sample fixture",
            priceObservedAt: now,
          },
          {
            walletId: wallet.id,
            tokenId: usdcArb.id,
            amountAtomic: "1500000000",
            amountDisplay: 1500,
            priceUsd: 0.999,
            valueUsd: 1498.5,
            priceSource: "sample fixture",
            priceObservedAt: now,
          },
          {
            walletId: wallet.id,
            tokenId: wethBase.id,
            amountAtomic: "420000000000000000",
            amountDisplay: 0.42,
            priceUsd: 2113.92,
            valueUsd: 887.85,
            priceSource: "sample fixture",
            priceObservedAt: now,
          },
        ],
      },
    },
  });

  const positions = [
    {
      strategyType: "lending",
      protocolId: aave.id,
      chainId: 8453,
      positionReference: "USDC supplied",
      underlyingAssetIds: ["USDC"],
      initialDepositUsd: 2438.6,
      currentValueUsd: 2500,
      accruedReturnUsd: 61.4,
      unrealisedPnlUsd: 61.4,
      rateValue: 4.82,
      rateType: "APY",
      receiptTokenId: null as string | null,
    },
    {
      strategyType: "stablecoin_lp",
      protocolId: uniswap.id,
      chainId: 8453,
      positionReference: "USDC/USDT 0.01% #184233",
      underlyingAssetIds: ["USDC", "USDT"],
      initialDepositUsd: 1715.8,
      currentValueUsd: 1800,
      accruedReturnUsd: 84.2,
      unrealisedPnlUsd: 84.2,
      rateValue: 6.15,
      rateType: "APY",
      receiptTokenId: null as string | null,
    },
    {
      strategyType: "yield_vault",
      protocolId: earn.id,
      chainId: 8453,
      positionReference: "gtUSDCp shares",
      underlyingAssetIds: ["USDC"],
      initialDepositUsd: 761.4,
      currentValueUsd: 800,
      accruedReturnUsd: 38.6,
      unrealisedPnlUsd: 38.6,
      rateValue: 5.1,
      rateType: "APY",
      receiptTokenId: gtusdcp.id,
    },
  ];

  for (const p of positions) {
    const position = await prisma.position.create({
      data: {
        userId: user.id,
        strategyType: p.strategyType,
        protocolId: p.protocolId,
        chainId: p.chainId,
        positionReference: p.positionReference,
        underlyingAssetIds: p.underlyingAssetIds,
        receiptTokenId: p.receiptTokenId,
        initialDepositUsd: p.initialDepositUsd,
        currentValueUsd: p.currentValueUsd,
        accruedReturnUsd: p.accruedReturnUsd,
        unrealisedPnlUsd: p.unrealisedPnlUsd,
        status: "open",
        dataMode: "sample",
        openedAt: new Date(now.getTime() - 46 * 24 * 60 * 60 * 1000),
        lastSyncedAt: now,
      },
    });

    await prisma.positionSnapshot.create({
      data: {
        positionId: position.id,
        snapshotAt: now,
        valueUsd: p.currentValueUsd,
        rateValue: p.rateValue,
        rateType: p.rateType,
        feesEarnedUsd: p.strategyType === "stablecoin_lp" ? 84.2 : null,
        pnlUsd: p.unrealisedPnlUsd,
        sourceMetadata: { provider: "sample fixture" },
      },
    });
  }

  await prisma.auditEvent.create({
    data: {
      userId: user.id,
      eventType: "demo.seeded",
      actorType: "system",
      details: { dataMode: "sample", snapshotId: snapshot.id },
    },
  });

  console.log(
    `Seeded sample portfolio for ${user.email}: ${positions.length} positions, 3 wallet balances.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
