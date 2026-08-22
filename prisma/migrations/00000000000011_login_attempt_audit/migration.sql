-- CreateEnum
CREATE TYPE "LoginAttemptOutcome" AS ENUM ('SUCCESS', 'INVALID_CREDENTIALS', 'RATE_LIMITED');

-- AlterTable: colunas novas nullable primeiro, porque `outcome` precisa de
-- backfill antes de virar NOT NULL (expand/contract em uma migration só —
-- não há deploy antigo lendo esta tabela em paralelo, é app único).
ALTER TABLE "login_attempts" ADD COLUMN "email" TEXT;
ALTER TABLE "login_attempts" ADD COLUMN "userAgent" TEXT;
ALTER TABLE "login_attempts" ADD COLUMN "outcome" "LoginAttemptOutcome";

-- Backfill: toda linha existente foi gravada pelo código anterior, que só
-- escrevia no ramo de falha de senha (nunca em sucesso, nunca em bloqueio).
UPDATE "login_attempts" SET "outcome" = 'INVALID_CREDENTIALS' WHERE "outcome" IS NULL;

ALTER TABLE "login_attempts" ALTER COLUMN "outcome" SET NOT NULL;

-- CreateIndex
CREATE INDEX "login_attempts_email_createdAt_idx" ON "login_attempts"("email", "createdAt");
