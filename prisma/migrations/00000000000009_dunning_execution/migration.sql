-- CreateEnum
CREATE TYPE "ExecutionOutcome" AS ENUM ('QUEUED', 'SKIPPED', 'PENDING_REVIEW');

-- CreateTable
CREATE TABLE "dunning_executions" (
    "id" TEXT NOT NULL,
    "chargeId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "outcome" "ExecutionOutcome" NOT NULL,
    "reason" TEXT,
    "messageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dunning_executions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dunning_executions_messageId_key" ON "dunning_executions"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "dunning_executions_chargeId_stepId_key" ON "dunning_executions"("chargeId", "stepId");

-- AddForeignKey
ALTER TABLE "dunning_executions" ADD CONSTRAINT "dunning_executions_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "charges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dunning_executions" ADD CONSTRAINT "dunning_executions_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "dunning_steps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dunning_executions" ADD CONSTRAINT "dunning_executions_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
