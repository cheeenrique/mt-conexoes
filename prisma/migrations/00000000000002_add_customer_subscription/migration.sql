CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CANCELLED');
CREATE TYPE "DiscountType" AS ENUM ('PERCENT', 'FIXED');

CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "document" TEXT,
    "notes" TEXT,
    "optedOut" BOOLEAN NOT NULL DEFAULT false,
    "optedOutAt" TIMESTAMP(3),
    "optedOutReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customers_phone_key" ON "customers"("phone");
CREATE INDEX "customers_name_idx" ON "customers"("name");

CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "planId" TEXT,
    "supplierId" TEXT,
    "priceCents" BIGINT NOT NULL,
    "costCents" BIGINT NOT NULL DEFAULT 0,
    "cycle" "BillingCycle" NOT NULL DEFAULT 'MONTHLY',
    "nextDueAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "discountType" "DiscountType",
    "discountValue" DECIMAL(10,2),
    "discountUntil" TIMESTAMP(3),
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "suspendedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "accessUsername" TEXT,
    "accessPasswordEnc" TEXT,
    "accessServer" TEXT,
    "screens" INTEGER NOT NULL DEFAULT 1,
    "accessNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "subscriptions_status_nextDueAt_idx" ON "subscriptions"("status", "nextDueAt");
CREATE INDEX "subscriptions_customerId_idx" ON "subscriptions"("customerId");
CREATE INDEX "subscriptions_supplierId_idx" ON "subscriptions"("supplierId");

ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_planId_fkey"
    FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "credential_reveals" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "revealedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,

    CONSTRAINT "credential_reveals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "credential_reveals_subscriptionId_revealedAt_idx" ON "credential_reveals"("subscriptionId", "revealedAt");
