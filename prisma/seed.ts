/**
 * Seeds a clearly-labelled SAMPLE portfolio so the product is explorable without a wallet
 * or funds. Every seeded row carries dataMode = "sample" and the UI shows it as such.
 *
 * Run: npm run db:seed
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
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

  const user = await prisma.user.create({ data: { email: "demo@localhost" } });

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
