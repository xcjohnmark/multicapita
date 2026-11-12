import { type Address } from "viem";
import { getPrisma } from "@/lib/db/client";
import { SUPPORTED_CHAINS, type TrackedToken } from "@/lib/chains";
import { readWalletBalances } from "@/lib/wallet/balances";
import {
  aggregateValuations,
  calculateTokenValuation,
  fetchSpotPrices,
  type RawBalanceInput,
  type TokenValuation,
} from "./valuation";

/**
 * Sync on-chain multi-chain balances for an authenticated wallet address
 * and persist a point-in-time PortfolioSnapshot with TokenBalance records.
 */
export async function syncWalletPortfolio(userId: string, walletAddress: Address) {
  const prisma = getPrisma();
  const address = walletAddress.toLowerCase();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, address: true },
  });
  if (!user) throw new Error(`User ${userId} not found.`);

  // 1. Ensure wallets exist in DB for Base & Arbitrum
  const walletMap = new Map<number, string>(); // chainId -> walletId
  const now = new Date();

  for (const chain of SUPPORTED_CHAINS) {
    const wallet = await prisma.wallet.upsert({
      where: {
        userId_chainId_address: {
          userId: user.id,
          chainId: chain.id,
          address,
        },
      },
      create: {
        userId: user.id,
        chainId: chain.id,
        address,
        chainFamily: "evm",
        ownershipVerifiedAt: now,
        label: `Live ${chain.name} Wallet`,
      },
      update: {
        ownershipVerifiedAt: now,
      },
      select: { id: true, chainId: true },
    });
    walletMap.set(wallet.chainId, wallet.id);
  }

  // 2. Ensure all tracked tokens exist in Token table
  const tokenDbMap = new Map<string, string>(); // `${chainId}:${contractAddress}` -> tokenId
  const allTrackedTokens: TrackedToken[] = [];

  for (const chain of SUPPORTED_CHAINS) {
    for (const token of chain.tokens) {
      allTrackedTokens.push(token);
      const contractAddress = token.address.toLowerCase();
      const existing = await prisma.token.upsert({
        where: {
          chainId_contractAddress: {
            chainId: token.chainId,
            contractAddress,
          },
        },
        create: {
          chainId: token.chainId,
          contractAddress,
          symbol: token.symbol,
          name: token.name,
          decimals: token.decimals,
          assetId: token.assetId ?? null,
          canonicalAssetId: token.canonicalAssetId ?? null,
          verificationStatus: "catalogue",
          metadataSource: "chains registry",
        },
        update: {
          symbol: token.symbol,
          name: token.name,
          decimals: token.decimals,
          assetId: token.assetId ?? null,
          canonicalAssetId: token.canonicalAssetId ?? null,
        },
        select: { id: true, chainId: true, contractAddress: true },
      });
      tokenDbMap.set(`${existing.chainId}:${existing.contractAddress}`, existing.id);
    }
  }

  // 3. Read live on-chain balances across Base and Arbitrum
  const onChainBalances = await readWalletBalances(walletAddress);

  // 4. Fetch spot prices for tracked assets
  const coingeckoIds = allTrackedTokens
    .map((t) => t.coingeckoId)
    .filter((id): id is string => Boolean(id));
  const spotPrices = await fetchSpotPrices(coingeckoIds);

  // 5. Compute valuations for every held token
  const valuations: (TokenValuation & { walletId: string; tokenId: string })[] = [];

  for (const chainBalance of onChainBalances.chains) {
    const chainConfig = SUPPORTED_CHAINS.find((c) => c.id === chainBalance.chainId);
    if (!chainConfig) continue;

    const walletId = walletMap.get(chainBalance.chainId);
    if (!walletId) continue;

    // Process native token
    if (chainBalance.native) {
      const nativeConfig = chainConfig.tokens.find((t) => t.isNative);
      const contractAddress = (nativeConfig?.address ?? "0x0000000000000000000000000000000000000000").toLowerCase();
      const tokenId = tokenDbMap.get(`${chainBalance.chainId}:${contractAddress}`);

      if (tokenId && nativeConfig) {
        const pricePoint = nativeConfig.coingeckoId
          ? spotPrices.get(nativeConfig.coingeckoId) ?? null
          : null;

        const input: RawBalanceInput = {
          chainId: chainBalance.chainId,
          contractAddress,
          symbol: chainBalance.native.symbol,
          decimals: chainBalance.native.decimals,
          amountAtomic: chainBalance.native.amountAtomic,
          isStablecoin: false,
          coingeckoId: nativeConfig.coingeckoId,
        };

        const val = calculateTokenValuation(input, pricePoint);
        valuations.push({ ...val, walletId, tokenId });
      }
    }

    // Process ERC-20 tokens
    for (const tokenLine of chainBalance.tokens) {
      const tokenConfig = chainConfig.tokens.find(
        (t) => t.address.toLowerCase() === tokenLine.address.toLowerCase(),
      );
      const contractAddress = tokenLine.address.toLowerCase();
      const tokenId = tokenDbMap.get(`${chainBalance.chainId}:${contractAddress}`);

      if (tokenId && tokenConfig) {
        const pricePoint = tokenConfig.coingeckoId
          ? spotPrices.get(tokenConfig.coingeckoId) ?? null
          : null;

        const input: RawBalanceInput = {
          chainId: chainBalance.chainId,
          contractAddress,
          symbol: tokenLine.symbol,
          decimals: tokenLine.decimals,
          amountAtomic: tokenLine.amountAtomic,
          isStablecoin: tokenConfig.isStablecoin,
          coingeckoId: tokenConfig.coingeckoId,
        };

        const val = calculateTokenValuation(input, pricePoint);
        valuations.push({ ...val, walletId, tokenId });
      }
    }
  }

  // 6. Aggregate portfolio totals
  const agg = aggregateValuations(valuations, new Date());

  // 7. Persist Snapshot and TokenBalance rows
  const snapshot = await prisma.portfolioSnapshot.create({
    data: {
      userId: user.id,
      snapshotAt: agg.observedAt,
      dataMode: "live",
      totalValueUsd: agg.totalValueUsd,
      dataQualityStatus: agg.dataQualityStatus,
      notes: agg.hasDepeg ? "Depeg warning detected" : null,
      balances: {
        create: valuations.map((v) => ({
          walletId: v.walletId,
          tokenId: v.tokenId,
          amountAtomic: v.amountAtomic,
          amountDisplay: v.amountDisplay,
          priceUsd: v.priceUsd,
          valueUsd: v.valueUsd,
          priceSource: v.priceSource,
          priceObservedAt: v.priceObservedAt,
        })),
      },
    },
    include: {
      balances: {
        include: {
          token: true,
          wallet: true,
        },
      },
    },
  });

  return snapshot;
}
