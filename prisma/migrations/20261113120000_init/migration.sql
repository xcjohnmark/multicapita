-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "AuthNonce" (
    "id" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "AuthNonce_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemFlag" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemFlag_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "chainFamily" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "label" TEXT,
    "ownershipVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chain" (
    "chainId" INTEGER NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ecosystem" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Chain_pkey" PRIMARY KEY ("chainId")
);

-- CreateTable
CREATE TABLE "Token" (
    "id" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "contractAddress" TEXT NOT NULL,
    "assetId" TEXT,
    "symbol" TEXT NOT NULL,
    "name" TEXT,
    "decimals" INTEGER NOT NULL,
    "canonicalAssetId" TEXT,
    "verificationStatus" TEXT NOT NULL DEFAULT 'unverified',
    "metadataSource" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "snapshotAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataMode" TEXT NOT NULL DEFAULT 'live',
    "totalValueUsd" DOUBLE PRECISION,
    "dataQualityStatus" TEXT NOT NULL DEFAULT 'complete',
    "notes" TEXT,

    CONSTRAINT "PortfolioSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TokenBalance" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "walletId" TEXT,
    "tokenId" TEXT NOT NULL,
    "amountAtomic" TEXT NOT NULL,
    "amountDisplay" DOUBLE PRECISION NOT NULL,
    "priceUsd" DOUBLE PRECISION,
    "valueUsd" DOUBLE PRECISION,
    "priceSource" TEXT,
    "priceObservedAt" TIMESTAMP(3),

    CONSTRAINT "TokenBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Protocol" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "protocolType" TEXT NOT NULL,
    "websiteUrl" TEXT,
    "docsUrl" TEXT,
    "riskNotes" TEXT,
    "isAllowlisted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Protocol_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL,
    "strategyType" TEXT NOT NULL,
    "protocolId" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "tokenOrPairRef" TEXT NOT NULL,
    "marketOrPoolAddress" TEXT,
    "estimatedApy" DOUBLE PRECISION,
    "rateType" TEXT,
    "tvlUsd" DOUBLE PRECISION,
    "volume24hUsd" DOUBLE PRECISION,
    "liquidityUsd" DOUBLE PRECISION,
    "feesJson" JSONB,
    "withdrawalJson" JSONB,
    "riskFlags" JSONB,
    "sourcePayload" JSONB,
    "dataMode" TEXT NOT NULL DEFAULT 'live',
    "observedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategyProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StrategyProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategyConstraint" (
    "id" TEXT NOT NULL,
    "strategyProfileId" TEXT NOT NULL,
    "minLiquidPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "maxProtocolExposurePercent" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "maxAssetExposurePercent" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "maxChainExposurePercent" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "maxStrategyExposurePercent" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "maxSlippageBps" INTEGER NOT NULL DEFAULT 100,
    "maxGasUsd" DOUBLE PRECISION NOT NULL DEFAULT 25,
    "minArbitrageProfitUsd" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "approvedChainIds" JSONB,
    "approvedProtocolIds" JSONB,
    "approvedTokenIds" JSONB,
    "requiresUserApproval" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StrategyConstraint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategyProposal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "strategyProfileId" TEXT,
    "modelId" TEXT NOT NULL,
    "objectiveSummary" TEXT NOT NULL,
    "proposalJson" JSONB NOT NULL,
    "validationStatus" TEXT NOT NULL DEFAULT 'draft',
    "validationErrors" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'open',

    CONSTRAINT "StrategyProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategyAllocation" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "opportunityId" TEXT,
    "strategyType" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "protocolId" TEXT NOT NULL,
    "tokenId" TEXT,
    "amountAtomic" TEXT NOT NULL,
    "amountUsdEstimate" DOUBLE PRECISION,
    "rationale" TEXT,
    "executionStatus" TEXT NOT NULL DEFAULT 'planned',

    CONSTRAINT "StrategyAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "allocationId" TEXT,
    "provider" TEXT NOT NULL DEFAULT '1click',
    "quoteReference" TEXT,
    "originAssetId" TEXT NOT NULL,
    "destinationAssetId" TEXT NOT NULL,
    "originAmountAtomic" TEXT NOT NULL,
    "expectedOutputAtomic" TEXT,
    "minOutputAtomic" TEXT,
    "slippageBps" INTEGER NOT NULL,
    "depositType" TEXT,
    "chainId" INTEGER,
    "depositAddress" TEXT,
    "recipient" TEXT,
    "recipientType" TEXT,
    "refundTo" TEXT,
    "refundType" TEXT,
    "feeBreakdown" JSONB,
    "rawResponse" JSONB,
    "signature" TEXT,
    "deadline" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'quoted',

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteStatusEvent" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "providerStatus" TEXT NOT NULL,
    "localStatus" TEXT NOT NULL,
    "raw" JSONB,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteStatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "quoteId" TEXT,
    "chainId" INTEGER NOT NULL,
    "txHash" TEXT,
    "transactionType" TEXT NOT NULL,
    "fromAddress" TEXT,
    "toAddress" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "failureReason" TEXT,
    "blockNumber" INTEGER,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "strategyType" TEXT NOT NULL,
    "protocolId" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "positionReference" TEXT NOT NULL,
    "underlyingAssetIds" JSONB,
    "receiptTokenId" TEXT,
    "initialDepositUsd" DOUBLE PRECISION,
    "currentValueUsd" DOUBLE PRECISION,
    "accruedReturnUsd" DOUBLE PRECISION,
    "realisedPnlUsd" DOUBLE PRECISION,
    "unrealisedPnlUsd" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'open',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSyncedAt" TIMESTAMP(3),

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PositionSnapshot" (
    "id" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "snapshotAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valueUsd" DOUBLE PRECISION,
    "underlyingAmounts" JSONB,
    "rateValue" DOUBLE PRECISION,
    "rateType" TEXT,
    "feesEarnedUsd" DOUBLE PRECISION,
    "rewardsEarnedUsd" DOUBLE PRECISION,
    "pnlUsd" DOUBLE PRECISION,
    "sourceMetadata" JSONB,

    CONSTRAINT "PositionSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "responseJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "eventType" TEXT NOT NULL,
    "actorType" TEXT NOT NULL DEFAULT 'system',
    "referenceId" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackedTrader" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "ecosystem" TEXT NOT NULL,
    "resolvedHandle" TEXT,
    "label" TEXT,
    "primaryStyle" TEXT NOT NULL DEFAULT 'Spot Blue-Chips',
    "indexerSources" JSONB,
    "realisedPnl90dUsd" DOUBLE PRECISION,
    "winRatePercent" DOUBLE PRECISION,
    "maxDrawdownPercent" DOUBLE PRECISION,
    "isMemecoinFree" BOOLEAN NOT NULL DEFAULT true,
    "hasExternalHedgeWarning" BOOLEAN NOT NULL DEFAULT true,
    "positionsJson" JSONB,
    "aiSummary" TEXT,
    "dataMode" TEXT NOT NULL DEFAULT 'live',
    "lastIndexedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrackedTrader_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CopySubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "trackedTraderId" TEXT NOT NULL,
    "fundingNearAccountId" TEXT NOT NULL,
    "executionMode" TEXT NOT NULL DEFAULT 'approval_required',
    "agentGrantReference" TEXT,
    "maxUsdPerTrade" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "maxDailyBudgetUsd" DOUBLE PRECISION NOT NULL DEFAULT 200,
    "dailyUsedUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dailyUsageDate" TEXT,
    "copyScaleBps" INTEGER NOT NULL DEFAULT 1000,
    "maxPriceDriftBps" INTEGER NOT NULL DEFAULT 150,
    "copySpot1Click" BOOLEAN NOT NULL DEFAULT true,
    "copyVaults" BOOLEAN NOT NULL DEFAULT true,
    "copyLending" BOOLEAN NOT NULL DEFAULT true,
    "copyLp" BOOLEAN NOT NULL DEFAULT false,
    "noMemecoinsOnly" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CopySubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuthNonce_nonce_key" ON "AuthNonce"("nonce");

-- CreateIndex
CREATE INDEX "AuthNonce_expiresAt_idx" ON "AuthNonce"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_address_key" ON "User"("address");

-- CreateIndex
CREATE INDEX "Wallet_userId_idx" ON "Wallet"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_userId_chainId_address_key" ON "Wallet"("userId", "chainId", "address");

-- CreateIndex
CREATE UNIQUE INDEX "Chain_slug_key" ON "Chain"("slug");

-- CreateIndex
CREATE INDEX "Token_symbol_idx" ON "Token"("symbol");

-- CreateIndex
CREATE INDEX "Token_assetId_idx" ON "Token"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "Token_chainId_contractAddress_key" ON "Token"("chainId", "contractAddress");

-- CreateIndex
CREATE INDEX "PortfolioSnapshot_userId_snapshotAt_idx" ON "PortfolioSnapshot"("userId", "snapshotAt");

-- CreateIndex
CREATE INDEX "TokenBalance_snapshotId_idx" ON "TokenBalance"("snapshotId");

-- CreateIndex
CREATE INDEX "TokenBalance_tokenId_idx" ON "TokenBalance"("tokenId");

-- CreateIndex
CREATE UNIQUE INDEX "Protocol_slug_key" ON "Protocol"("slug");

-- CreateIndex
CREATE INDEX "Opportunity_strategyType_chainId_status_idx" ON "Opportunity"("strategyType", "chainId", "status");

-- CreateIndex
CREATE INDEX "Opportunity_observedAt_idx" ON "Opportunity"("observedAt");

-- CreateIndex
CREATE INDEX "StrategyProfile_userId_idx" ON "StrategyProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "StrategyConstraint_strategyProfileId_key" ON "StrategyConstraint"("strategyProfileId");

-- CreateIndex
CREATE INDEX "StrategyProposal_userId_createdAt_idx" ON "StrategyProposal"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "StrategyAllocation_proposalId_idx" ON "StrategyAllocation"("proposalId");

-- CreateIndex
CREATE INDEX "Quote_userId_createdAt_idx" ON "Quote"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Quote_status_idx" ON "Quote"("status");

-- CreateIndex
CREATE INDEX "QuoteStatusEvent_quoteId_observedAt_idx" ON "QuoteStatusEvent"("quoteId", "observedAt");

-- CreateIndex
CREATE INDEX "Transaction_userId_submittedAt_idx" ON "Transaction"("userId", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_chainId_txHash_key" ON "Transaction"("chainId", "txHash");

-- CreateIndex
CREATE INDEX "Position_userId_status_idx" ON "Position"("userId", "status");

-- CreateIndex
CREATE INDEX "PositionSnapshot_positionId_snapshotAt_idx" ON "PositionSnapshot"("positionId", "snapshotAt");

-- CreateIndex
CREATE INDEX "IdempotencyKey_createdAt_idx" ON "IdempotencyKey"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_userId_scope_key_key" ON "IdempotencyKey"("userId", "scope", "key");

-- CreateIndex
CREATE INDEX "AuditEvent_userId_createdAt_idx" ON "AuditEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_eventType_idx" ON "AuditEvent"("eventType");

-- CreateIndex
CREATE INDEX "TrackedTrader_isMemecoinFree_lastIndexedAt_idx" ON "TrackedTrader"("isMemecoinFree", "lastIndexedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TrackedTrader_ecosystem_address_key" ON "TrackedTrader"("ecosystem", "address");

-- CreateIndex
CREATE INDEX "CopySubscription_userId_status_idx" ON "CopySubscription"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CopySubscription_userId_trackedTraderId_key" ON "CopySubscription"("userId", "trackedTraderId");

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioSnapshot" ADD CONSTRAINT "PortfolioSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TokenBalance" ADD CONSTRAINT "TokenBalance_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "PortfolioSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TokenBalance" ADD CONSTRAINT "TokenBalance_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TokenBalance" ADD CONSTRAINT "TokenBalance_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "Token"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_protocolId_fkey" FOREIGN KEY ("protocolId") REFERENCES "Protocol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyProfile" ADD CONSTRAINT "StrategyProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyConstraint" ADD CONSTRAINT "StrategyConstraint_strategyProfileId_fkey" FOREIGN KEY ("strategyProfileId") REFERENCES "StrategyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyProposal" ADD CONSTRAINT "StrategyProposal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyProposal" ADD CONSTRAINT "StrategyProposal_strategyProfileId_fkey" FOREIGN KEY ("strategyProfileId") REFERENCES "StrategyProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyAllocation" ADD CONSTRAINT "StrategyAllocation_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "StrategyProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyAllocation" ADD CONSTRAINT "StrategyAllocation_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyAllocation" ADD CONSTRAINT "StrategyAllocation_protocolId_fkey" FOREIGN KEY ("protocolId") REFERENCES "Protocol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "StrategyAllocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteStatusEvent" ADD CONSTRAINT "QuoteStatusEvent_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_protocolId_fkey" FOREIGN KEY ("protocolId") REFERENCES "Protocol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_receiptTokenId_fkey" FOREIGN KEY ("receiptTokenId") REFERENCES "Token"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PositionSnapshot" ADD CONSTRAINT "PositionSnapshot_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdempotencyKey" ADD CONSTRAINT "IdempotencyKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopySubscription" ADD CONSTRAINT "CopySubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopySubscription" ADD CONSTRAINT "CopySubscription_trackedTraderId_fkey" FOREIGN KEY ("trackedTraderId") REFERENCES "TrackedTrader"("id") ON DELETE CASCADE ON UPDATE CASCADE;

