-- CreateTable
CREATE TABLE "QuoteStatusEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quoteId" TEXT NOT NULL,
    "providerStatus" TEXT NOT NULL,
    "localStatus" TEXT NOT NULL,
    "raw" JSONB,
    "observedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuoteStatusEvent_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "QuoteStatusEvent_quoteId_observedAt_idx" ON "QuoteStatusEvent"("quoteId", "observedAt");
