-- DropIndex
DROP INDEX "dunning_executions_messageId_key";

-- CreateIndex
CREATE INDEX "dunning_executions_messageId_idx" ON "dunning_executions"("messageId");
