-- CreateEnum
CREATE TYPE "MessageKind" AS ENUM ('DUNNING', 'MANUAL', 'TEST');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'CANCELLED', 'SKIPPED');

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "chargeId" TEXT,
    "channelId" TEXT,
    "kind" "MessageKind" NOT NULL DEFAULT 'DUNNING',
    "status" "MessageStatus" NOT NULL DEFAULT 'PENDING',
    "toPhone" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "scheduledDate" DATE NOT NULL,
    "sentAt" TIMESTAMP(3),
    "externalId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "failReason" TEXT,
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "messages_status_scheduledFor_idx" ON "messages"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "messages_customerId_createdAt_idx" ON "messages"("customerId", "createdAt");

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "charges"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channel_configs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- T7: um customer recebe no máximo uma mensagem de cobrança por dia
CREATE UNIQUE INDEX messages_dunning_daily_dedupe
  ON messages ("customerId", "scheduledDate")
  WHERE kind = 'DUNNING' AND status <> 'CANCELLED';
