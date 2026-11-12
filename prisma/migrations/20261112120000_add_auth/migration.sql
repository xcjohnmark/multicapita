-- Sign-in nonces, runtime flags, and wallet-to-user resolution.

ALTER TABLE "User" ADD COLUMN "address" TEXT;
CREATE UNIQUE INDEX "User_address_key" ON "User"("address");

CREATE TABLE "AuthNonce" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nonce" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "issuedAt" DATETIME NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME
);
CREATE UNIQUE INDEX "AuthNonce_nonce_key" ON "AuthNonce"("nonce");
CREATE INDEX "AuthNonce_expiresAt_idx" ON "AuthNonce"("expiresAt");

CREATE TABLE "SystemFlag" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);
