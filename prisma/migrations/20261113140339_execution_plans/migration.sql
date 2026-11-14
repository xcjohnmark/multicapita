-- AlterTable
ALTER TABLE "Position" ADD COLUMN     "dataMode" TEXT NOT NULL DEFAULT 'live',
ADD COLUMN     "simulationKey" TEXT;

-- CreateTable
CREATE TABLE "OpportunityObservation" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "rate" DOUBLE PRECISION,
    "tvlUsd" DOUBLE PRECISION,
    "source" TEXT NOT NULL,
    "dataMode" TEXT NOT NULL,

    CONSTRAINT "OpportunityObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecutionPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "simulationKey" TEXT,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "opportunityId" TEXT,
    "positionId" TEXT,
    "proposalId" TEXT,
    "inputJson" JSONB NOT NULL,
    "previewJson" JSONB,
    "dataMode" TEXT NOT NULL,
    "simulated" BOOLEAN NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "sourceChainId" INTEGER NOT NULL,
    "sourceTokenAddress" TEXT NOT NULL,
    "sourceSymbol" TEXT NOT NULL,
    "amountAtomic" TEXT NOT NULL,
    "amountDecimals" INTEGER NOT NULL,
    "amountUsd" DOUBLE PRECISION,
    "approvedAt" TIMESTAMP(3),
    "approvedAmountAtomic" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExecutionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecutionStep" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "simulated" BOOLEAN NOT NULL,
    "amountAtomic" TEXT,
    "decimals" INTEGER,
    "symbol" TEXT,
    "quoteId" TEXT,
    "txHash" TEXT,
    "simulationRef" TEXT,
    "instructionJson" JSONB,
    "resultJson" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ExecutionStep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OpportunityObservation_opportunityId_observedAt_idx" ON "OpportunityObservation"("opportunityId", "observedAt");

-- CreateIndex
CREATE INDEX "ExecutionPlan_userId_simulationKey_createdAt_idx" ON "ExecutionPlan"("userId", "simulationKey", "createdAt");

-- CreateIndex
CREATE INDEX "ExecutionPlan_status_idx" ON "ExecutionPlan"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ExecutionStep_planId_index_key" ON "ExecutionStep"("planId", "index");

-- CreateIndex
CREATE INDEX "Position_userId_simulationKey_idx" ON "Position"("userId", "simulationKey");

-- AddForeignKey
ALTER TABLE "OpportunityObservation" ADD CONSTRAINT "OpportunityObservation_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionPlan" ADD CONSTRAINT "ExecutionPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionPlan" ADD CONSTRAINT "ExecutionPlan_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionPlan" ADD CONSTRAINT "ExecutionPlan_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionStep" ADD CONSTRAINT "ExecutionStep_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ExecutionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
