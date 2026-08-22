-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'CONVERTED', 'DISCARDED');

-- CreateEnum
CREATE TYPE "LeadAttemptOutcome" AS ENUM ('ACCEPTED', 'INVALID', 'RATE_LIMITED');

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "city" TEXT,
    "interestPlan" TEXT,
    "source" TEXT NOT NULL,
    "campaign" TEXT,
    "landingPath" TEXT,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "customerId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_attempts" (
    "id" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "outcome" "LeadAttemptOutcome" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "leads_status_createdAt_idx" ON "leads"("status", "createdAt");

-- CreateIndex
CREATE INDEX "leads_phone_idx" ON "leads"("phone");

-- CreateIndex
CREATE INDEX "leads_customerId_idx" ON "leads"("customerId");

-- CreateIndex
CREATE INDEX "lead_attempts_ip_createdAt_idx" ON "lead_attempts"("ip", "createdAt");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ⚠️ SQL manual — `schema.prisma` não expressa `CHECK` (ver prisma/README.md).
--
-- Limite de tamanho por coluna: `leads` é a ÚNICA tabela escrita por um
-- endpoint público. O Zod da rota já corta, mas o Zod é código de aplicação:
-- um bug de validação, um segundo caller ou um script de import passariam por
-- cima dele. O teto vive no banco porque é ele que sobrevive ao bug.
ALTER TABLE "leads"
  ADD CONSTRAINT "leads_name_length_check" CHECK (char_length("name") BETWEEN 1 AND 120),
  ADD CONSTRAINT "leads_phone_length_check" CHECK (char_length("phone") BETWEEN 8 AND 20),
  ADD CONSTRAINT "leads_city_length_check" CHECK ("city" IS NULL OR char_length("city") <= 80),
  ADD CONSTRAINT "leads_interest_plan_length_check" CHECK ("interestPlan" IS NULL OR char_length("interestPlan") <= 60),
  ADD CONSTRAINT "leads_source_length_check" CHECK (char_length("source") BETWEEN 1 AND 60),
  ADD CONSTRAINT "leads_campaign_length_check" CHECK ("campaign" IS NULL OR char_length("campaign") <= 80),
  ADD CONSTRAINT "leads_landing_path_length_check" CHECK ("landingPath" IS NULL OR char_length("landingPath") <= 200),
  ADD CONSTRAINT "leads_note_length_check" CHECK ("note" IS NULL OR char_length("note") <= 500);

-- Lead convertido sem cliente vinculado é um lead perdido: some da fila de
-- trabalho ("Convertido") sem que ninguém consiga chegar no cadastro. Um `if`
-- no service não sobrevive a um UPDATE feito fora dele.
ALTER TABLE "leads"
  ADD CONSTRAINT "leads_converted_has_customer_check"
  CHECK ("status" <> 'CONVERTED' OR "customerId" IS NOT NULL);

-- Poda de `lead_attempts`: sem índice por data não há como limpar a tabela
-- sem seq scan. Declarado também no schema (`@@index([createdAt])`).
CREATE INDEX "lead_attempts_createdAt_idx" ON "lead_attempts"("createdAt");
