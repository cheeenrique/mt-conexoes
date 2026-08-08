-- CreateEnum
CREATE TYPE "ChargeStatus" AS ENUM ('OPEN', 'OVERDUE', 'PARTIALLY_PAID', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('PIX', 'CASH', 'TRANSFER', 'CARD', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentSource" AS ENUM ('MANUAL', 'WEBHOOK');

-- CreateTable
CREATE TABLE "charges" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "supplierId" TEXT,
    "principalCents" BIGINT NOT NULL,
    "discountCents" BIGINT NOT NULL DEFAULT 0,
    "costCents" BIGINT NOT NULL DEFAULT 0,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ChargeStatus" NOT NULL DEFAULT 'OPEN',
    "paidAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,

    CONSTRAINT "charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "chargeId" TEXT NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'PIX',
    "source" "PaymentSource" NOT NULL DEFAULT 'MANUAL',
    "externalId" TEXT,
    "idempotencyKey" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "charges_status_dueAt_idx" ON "charges"("status", "dueAt");

-- CreateIndex
CREATE INDEX "charges_customerId_dueAt_idx" ON "charges"("customerId", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "charges_subscriptionId_periodStart_key" ON "charges"("subscriptionId", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotencyKey_key" ON "payments"("idempotencyKey");

-- CreateIndex
CREATE INDEX "payments_chargeId_idx" ON "payments"("chargeId");

-- CreateIndex
CREATE INDEX "payments_paidAt_idx" ON "payments"("paidAt");

-- CreateIndex
CREATE UNIQUE INDEX "payments_source_externalId_key" ON "payments"("source", "externalId");

-- AddForeignKey
ALTER TABLE "charges" ADD CONSTRAINT "charges_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charges" ADD CONSTRAINT "charges_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charges" ADD CONSTRAINT "charges_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "charges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Dinheiro não é negativo
ALTER TABLE payments ADD CONSTRAINT payments_amount_positive CHECK ("amountCents" > 0);
ALTER TABLE charges  ADD CONSTRAINT charges_principal_nonneg CHECK ("principalCents" >= 0);
ALTER TABLE charges  ADD CONSTRAINT charges_cost_nonneg      CHECK ("costCents" >= 0);
ALTER TABLE charges  ADD CONSTRAINT charges_discount_bounded CHECK ("discountCents" >= 0 AND "discountCents" <= "principalCents");

-- No máximo uma cobrança aberta por assinatura
CREATE UNIQUE INDEX subscriptions_single_open_charge ON charges ("subscriptionId")
  WHERE status IN ('OPEN', 'OVERDUE', 'PARTIALLY_PAID');
