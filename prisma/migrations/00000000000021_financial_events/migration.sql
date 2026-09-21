-- Rastro de mutação financeira — design em
-- docs/superpowers/specs/2026-09-20-historico-e-edicoes-financeiras-design.md
--
-- Aditiva. Nenhuma FK de propósito (mesmo desenho de credential_reveals):
-- o pagamento removido some de `payments` e o evento precisa sobreviver a
-- isso. `before`/`after` são JSONB com centavos em string — registro, nunca
-- fonte de saldo.
CREATE TYPE "FinancialEventEntity" AS ENUM ('SUBSCRIPTION', 'CHARGE', 'PAYMENT');

CREATE TYPE "FinancialEventKind" AS ENUM (
  'SUBSCRIPTION_PLAN_CHANGED',
  'SUBSCRIPTION_PRICE_EDITED',
  'SUBSCRIPTION_CYCLE_CHANGED',
  'SUBSCRIPTION_DUE_DATE_EDITED',
  'SUBSCRIPTION_STATUS_CHANGED',
  'CHARGE_AMOUNT_EDITED',
  'CHARGE_REALIGNED',
  'CHARGE_CANCELLED',
  'CHARGE_WRITTEN_OFF',
  'PAYMENT_REGISTERED',
  'PAYMENT_REMOVED'
);

CREATE TABLE "financial_events" (
  "id"         TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "entityType" "FinancialEventEntity" NOT NULL,
  "entityId"   TEXT NOT NULL,
  "kind"       "FinancialEventKind" NOT NULL,
  "before"     JSONB,
  "after"      JSONB,
  "reason"     TEXT,
  "userId"     TEXT,
  "at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "financial_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "financial_events_customerId_at_idx" ON "financial_events"("customerId", "at");
