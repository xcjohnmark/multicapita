-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "chainFamily" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "label" TEXT,
    "ownershipVerifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Chain" (
    "chainId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ecosystem" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "Token" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chainId" INTEGER NOT NULL,
    "contractAddress" TEXT NOT NULL,
    "assetId" TEXT,
    "symbol" TEXT NOT NULL,
    "name" TEXT,
    "decimals" INTEGER NOT NULL,
    "canonicalAssetId" TEXT,
    "verificationStatus" TEXT NOT NULL DEFAULT 'unverified',
    "metadataSource" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PortfolioSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "snapshotAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataMode" TEXT NOT NULL DEFAULT 'live',
    "totalValueUsd" REAL,
    "dataQualityStatus" TEXT NOT NULL DEFAULT 'complete',
    "notes" TEXT,
    CONSTRAINT "PortfolioSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TokenBalance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "snapshotId" TEXT NOT NULL,
    "walletId" TEXT,
    "tokenId" TEXT NOT NULL,
    "amountAtomic" TEXT NOT NULL,
    "amountDisplay" REAL NOT NULL,
    "priceUsd" REAL,
    "valueUsd" REAL,
    "priceSource" TEXT,
    "priceObservedAt" DATETIME,
    CONSTRAINT "TokenBalance_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "PortfolioSnapshot" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TokenBalance_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TokenBalance_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "Token" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Protocol" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "protocolType" TEXT NOT NULL,
    "websiteUrl" TEXT,
    "docsUrl" TEXT,
    "riskNotes" TEXT,
    "isAllowlisted" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "strategyType" TEXT NOT NULL,
    "protocolId" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "tokenOrPairRef" TEXT NOT NULL,
    "marketOrPoolAddress" TEXT,
    "estimatedApy" REAL,
    "rateType" TEXT,
    "tvlUsd" REAL,
    "volume24hUsd" REAL,
    "liquidityUsd" REAL,
    "feesJson" JSONB,
    "withdrawalJson" JSONB,
    "riskFlags" JSONB,
    "sourcePayload" JSONB,
    "dataMode" TEXT NOT NULL DEFAULT 'live',
    "observedAt" DATETIME NOT NULL,
    "expiresAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'active',
    CONSTRAINT "Opportunity_protocolId_fkey" FOREIGN KEY ("protocolId") REFERENCES "Protocol" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StrategyProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StrategyProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StrategyConstraint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "strategyProfileId" TEXT NOT NULL,
    "minLiquidPercent" REAL NOT NULL DEFAULT 0,
    "maxProtocolExposurePercent" REAL NOT NULL DEFAULT 100,
    "maxAssetExposurePercent" REAL NOT NULL DEFAULT 100,
    "maxChainExposurePercent" REAL NOT NULL DEFAULT 100,
    "maxStrategyExposurePercent" REAL NOT NULL DEFAULT 100,
    "maxSlippageBps" INTEGER NOT NULL DEFAULT 100,
    "maxGasUsd" REAL NOT NULL DEFAULT 25,
    "minArbitrageProfitUsd" REAL NOT NULL DEFAULT 5,
    "approvedChainIds" JSONB,
    "approvedProtocolIds" JSONB,
    "approvedTokenIds" JSONB,
    "requiresUserApproval" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StrategyConstraint_strategyProfileId_fkey" FOREIGN KEY ("strategyProfileId") REFERENCES "StrategyProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StrategyProposal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "strategyProfileId" TEXT,
    "modelId" TEXT NOT NULL,
    "objectiveSummary" TEXT NOT NULL,
    "proposalJson" JSONB NOT NULL,
    "validationStatus" TEXT NOT NULL DEFAULT 'draft',
    "validationErrors" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME,
    "approvedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'open',
    CONSTRAINT "StrategyProposal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StrategyProposal_strategyProfileId_fkey" FOREIGN KEY ("strategyProfileId") REFERENCES "StrategyProfile" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StrategyAllocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "proposalId" TEXT NOT NULL,
    "opportunityId" TEXT,
    "strategyType" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "protocolId" TEXT NOT NULL,
    "tokenId" TEXT,
    "amountAtomic" TEXT NOT NULL,
    "amountUsdEstimate" REAL,
    "rationale" TEXT,
    "executionStatus" TEXT NOT NULL DEFAULT 'planned',
    CONSTRAINT "StrategyAllocation_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "StrategyProposal" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StrategyAllocation_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StrategyAllocation_protocolId_fkey" FOREIGN KEY ("protocolId") REFERENCES "Protocol" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "depositAddress" TEXT,
    "recipient" TEXT,
    "recipientType" TEXT,
    "refundTo" TEXT,
    "refundType" TEXT,
    "feeBreakdown" JSONB,
    "rawResponse" JSONB,
    "signature" TEXT,
    "deadline" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'quoted',
    CONSTRAINT "Quote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Quote_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "StrategyAllocation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" DATETIME,
    CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Transaction_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "strategyType" TEXT NOT NULL,
    "protocolId" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "positionReference" TEXT NOT NULL,
    "underlyingAssetIds" JSONB,
    "receiptTokenId" TEXT,
    "initialDepositUsd" REAL,
    "currentValueUsd" REAL,
    "accruedReturnUsd" REAL,
    "realisedPnlUsd" REAL,
    "unrealisedPnlUsd" REAL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "openedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSyncedAt" DATETIME,
    CONSTRAINT "Position_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Position_protocolId_fkey" FOREIGN KEY ("protocolId") REFERENCES "Protocol" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Position_receiptTokenId_fkey" FOREIGN KEY ("receiptTokenId") REFERENCES "Token" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PositionSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "positionId" TEXT NOT NULL,
    "snapshotAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valueUsd" REAL,
    "underlyingAmounts" JSONB,
    "rateValue" REAL,
    "rateType" TEXT,
    "feesEarnedUsd" REAL,
    "rewardsEarnedUsd" REAL,
    "pnlUsd" REAL,
    "sourceMetadata" JSONB,
    CONSTRAINT "PositionSnapshot_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "eventType" TEXT NOT NULL,
    "actorType" TEXT NOT NULL DEFAULT 'system',
    "referenceId" TEXT,
    "details" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

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
CREATE INDEX "Transaction_userId_submittedAt_idx" ON "Transaction"("userId", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_chainId_txHash_key" ON "Transaction"("chainId", "txHash");

-- CreateIndex
CREATE INDEX "Position_userId_status_idx" ON "Position"("userId", "status");

-- CreateIndex
CREATE INDEX "PositionSnapshot_positionId_snapshotAt_idx" ON "PositionSnapshot"("positionId", "snapshotAt");

-- CreateIndex
CREATE INDEX "AuditEvent_userId_createdAt_idx" ON "AuditEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_eventType_idx" ON "AuditEvent"("eventType");
