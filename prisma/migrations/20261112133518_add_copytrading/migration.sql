-- CreateTable
CREATE TABLE "TrackedTrader" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "address" TEXT NOT NULL,
    "ecosystem" TEXT NOT NULL,
    "resolvedHandle" TEXT,
    "label" TEXT,
    "primaryStyle" TEXT NOT NULL DEFAULT 'Spot Blue-Chips',
    "indexerSources" JSONB,
    "realisedPnl90dUsd" REAL,
    "winRatePercent" REAL,
    "maxDrawdownPercent" REAL,
    "isMemecoinFree" BOOLEAN NOT NULL DEFAULT true,
    "hasExternalHedgeWarning" BOOLEAN NOT NULL DEFAULT true,
    "positionsJson" JSONB,
    "aiSummary" TEXT,
    "dataMode" TEXT NOT NULL DEFAULT 'live',
    "lastIndexedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CopySubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "trackedTraderId" TEXT NOT NULL,
    "fundingNearAccountId" TEXT NOT NULL,
    "executionMode" TEXT NOT NULL DEFAULT 'approval_required',
    "agentGrantReference" TEXT,
    "maxUsdPerTrade" REAL NOT NULL DEFAULT 50,
    "maxDailyBudgetUsd" REAL NOT NULL DEFAULT 200,
    "dailyUsedUsd" REAL NOT NULL DEFAULT 0,
    "dailyUsageDate" TEXT,
    "copyScaleBps" INTEGER NOT NULL DEFAULT 1000,
    "maxPriceDriftBps" INTEGER NOT NULL DEFAULT 150,
    "copySpot1Click" BOOLEAN NOT NULL DEFAULT true,
    "copyVaults" BOOLEAN NOT NULL DEFAULT true,
    "copyLending" BOOLEAN NOT NULL DEFAULT true,
    "copyLp" BOOLEAN NOT NULL DEFAULT false,
    "noMemecoinsOnly" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CopySubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CopySubscription_trackedTraderId_fkey" FOREIGN KEY ("trackedTraderId") REFERENCES "TrackedTrader" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "TrackedTrader_isMemecoinFree_lastIndexedAt_idx" ON "TrackedTrader"("isMemecoinFree", "lastIndexedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TrackedTrader_ecosystem_address_key" ON "TrackedTrader"("ecosystem", "address");

-- CreateIndex
CREATE INDEX "CopySubscription_userId_status_idx" ON "CopySubscription"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CopySubscription_userId_trackedTraderId_key" ON "CopySubscription"("userId", "trackedTraderId");
