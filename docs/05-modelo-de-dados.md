# 05 — Modelo de Dados

> Schema Prisma. Constraints avançadas (RLS, `EXCLUDE`, índices parciais) vão em SQL manual nas migrations — ver seção final.

## Convenções

- Toda tabela de negócio tem `tenantId` (exceto `User`, `Tenant`, `Membership`)
- Dinheiro: `BigInt` em centavos, sufixo `Cents`
- Datas: `DateTime` em UTC, sufixo `At`
- IDs: `uuid` v7 (ordenável, bom para índice)
- Soft delete só onde há valor histórico; nunca como substituto de anonimização

---

## Identidade e tenant

```prisma
enum LegalType { INDIVIDUAL COMPANY }
enum DocType   { CPF CNPJ }
enum Role      { OWNER ADMIN FINANCE SUPPORT VIEWER }
enum MembershipStatus { INVITED ACTIVE SUSPENDED }

model Tenant {
  id            String    @id @default(uuid(7))
  slug          String    @unique
  legalType     LegalType
  legalName     String              // razão social OU nome completo
  displayName   String              // usado em mensagens e portal
  documentType  DocType?
  documentValue String?             // opcional no cadastro; exigido por gateway
  email         String
  phone         String?
  timezone      String    @default("America/Sao_Paulo")
  locale        String    @default("pt-BR")
  logoUrl       String?
  planCode      String    @default("starter")   // ver doc 15
  planStatus    String    @default("trialing")
  trialEndsAt   DateTime?
  createdAt     DateTime  @default(now())
  deletedAt     DateTime?

  @@index([documentType, documentValue])
}

model TenantSlugHistory {
  id        String   @id @default(uuid(7))
  tenantId  String
  slug      String   @unique
  changedAt DateTime @default(now())
}

model User {
  id              String    @id @default(uuid(7))
  email           String    @unique
  passwordHash    String
  name            String
  emailVerifiedAt DateTime?
  lastLoginAt     DateTime?
  createdAt       DateTime  @default(now())
}

model Membership {
  id        String           @id @default(uuid(7))
  userId    String
  tenantId  String
  role      Role
  status    MembershipStatus @default(ACTIVE)
  invitedBy String?
  createdAt DateTime         @default(now())

  @@unique([userId, tenantId])
  @@index([tenantId, status])
}

model RefreshToken {
  id         String    @id @default(uuid(7))
  userId     String
  familyId   String              // rotação: reuso revoga a família inteira
  tokenHash  String    @unique
  expiresAt  DateTime
  revokedAt  DateTime?
  ip         String?
  userAgent  String?
  createdAt  DateTime  @default(now())

  @@index([userId, familyId])
}
```

---

## Clientes e assinaturas

```prisma
enum CustomerStatus { ACTIVE INACTIVE ARCHIVED }
enum ContactType    { PHONE EMAIL }
enum BillingModel   { PREPAID POSTPAID }
enum Periodicity    { WEEKLY MONTHLY QUARTERLY SEMIANNUAL ANNUAL CUSTOM_DAYS }
enum SubscriptionStatus { TRIALING ACTIVE PAST_DUE SUSPENDED PAUSED CANCELED EXPIRED }

model Customer {
  id            String         @id @default(uuid(7))
  tenantId      String
  name          String
  documentType  DocType?
  documentValue String?
  notes         String?
  status        CustomerStatus @default(ACTIVE)
  isVip         Boolean        @default(false)
  city          String?
  state         String?
  importBatchId String?
  externalRef   String?        // id do sistema de origem
  anonymizedAt  DateTime?
  createdAt     DateTime       @default(now())
  deletedAt     DateTime?

  @@index([tenantId, status])
  @@index([tenantId, name])
}

model Contact {
  id          String      @id @default(uuid(7))
  tenantId    String
  customerId  String
  type        ContactType
  value       String              // telefone em E.164; e-mail normalizado
  isPrimary   Boolean     @default(false)
  optInAt     DateTime?
  optInSource String?
  optOutAt    DateTime?
  verifiedAt  DateTime?

  @@index([tenantId, type, value])
  @@index([customerId])
}

model Tag {
  id       String @id @default(uuid(7))
  tenantId String
  name     String
  color    String?
  @@unique([tenantId, name])
}

model CustomerTag {
  customerId String
  tagId      String
  @@id([customerId, tagId])
}

model Plan {
  id                String      @id @default(uuid(7))
  tenantId          String
  name              String
  description       String?
  defaultPriceCents BigInt              // SUGESTÃO — verdade está na assinatura
  periodicity       Periodicity @default(MONTHLY)
  customDays        Int?                // quando periodicity = CUSTOM_DAYS
  billingModel      BillingModel
  costCents         BigInt      @default(0)   // doc 17
  supplierId        String?
  trialDays         Int         @default(0)
  isActive          Boolean     @default(true)
  createdAt         DateTime    @default(now())

  @@unique([tenantId, name])
}

model Supplier {                    // doc 17
  id            String   @id @default(uuid(7))
  tenantId      String
  name          String
  unitCostCents BigInt   @default(0)
  notes         String?
  isActive      Boolean  @default(true)
  createdAt     DateTime @default(now())

  @@unique([tenantId, name])
}

model CustomFieldDef {              // doc 17
  id       String  @id @default(uuid(7))
  tenantId String
  scope    String            // SUBSCRIPTION | CUSTOMER
  key      String
  label    String
  type     String            // TEXT | NUMBER | DATE | SELECT | SECRET
  options  Json?
  required Boolean @default(false)

  @@unique([tenantId, scope, key])
}

model Subscription {
  id             String             @id @default(uuid(7))
  tenantId       String
  customerId     String
  planId         String
  status         SubscriptionStatus @default(ACTIVE)
  billingModel   BillingModel               // copiado do plano na criação
  priceCents     BigInt                     // preço negociado — a verdade
  periodicity    Periodicity
  customDays     Int?
  startedAt      DateTime
  nextDueAt      DateTime?                  // âncora individual
  trialEndsAt    DateTime?
  pausedUntil    DateTime?
  canceledAt     DateTime?
  cancelReason   String?
  suspendedAt    DateTime?
  autoRenew      Boolean            @default(true)
  costCents      BigInt             @default(0)   // doc 17
  supplierId     String?
  discountType   String?                          // PERCENT | FIXED
  discountValue  Decimal?
  discountUntil  DateTime?
  customFields   Json?
  importBatchId  String?
  createdAt      DateTime           @default(now())

  @@index([tenantId, status, nextDueAt])
  @@index([customerId])
}

model SubscriptionEvent {          // histórico imutável de transições
  id             String   @id @default(uuid(7))
  tenantId       String
  subscriptionId String
  fromStatus     String?
  toStatus       String
  reason         String?
  actorType      String            // USER | SYSTEM | WEBHOOK
  actorId        String?
  metadata       Json?
  occurredAt     DateTime @default(now())

  @@index([subscriptionId, occurredAt])
}

model AccessPeriod {               // somente PREPAID
  id             String   @id @default(uuid(7))
  tenantId       String
  subscriptionId String
  startsAt       DateTime
  endsAt         DateTime
  grantedByPaymentId String?
  createdAt      DateTime @default(now())

  @@index([tenantId, subscriptionId, endsAt])
}
```

---

## Financeiro

```prisma
enum ChargeStatus  { DRAFT OPEN PARTIALLY_PAID PAID OVERDUE CANCELED WRITTEN_OFF }
enum PaymentStatus { PENDING CONFIRMED FAILED REFUNDED CHARGED_BACK }
enum PaymentMethod { PIX BOLETO CREDIT_CARD DEBIT_CARD CASH TRANSFER OTHER }
enum LedgerAccount { AR CASH CREDIT REVENUE COGS AP DISCOUNT INTEREST PENALTY WRITE_OFF REFUND }
enum LedgerDirection { DEBIT CREDIT }

model Charge {
  id              String       @id @default(uuid(7))
  tenantId        String
  customerId      String
  subscriptionId  String?
  status          ChargeStatus @default(OPEN)
  description     String
  principalCents  BigInt               // valor original
  penaltyCents    BigInt       @default(0)
  interestCents   BigInt       @default(0)
  discountCents   BigInt       @default(0)
  totalCents      BigInt               // principal + multa + juros - desconto
  paidCents       BigInt       @default(0)
  dueAt           DateTime
  issuedAt        DateTime     @default(now())
  paidAt          DateTime?
  canceledAt      DateTime?
  writtenOffAt    DateTime?
  competenceMonth String               // "2026-07" — para relatório
  importBatchId   String?
  externalId      String?              // id no gateway
  costCents       BigInt       @default(0)   // custo congelado na emissão — doc 17
  supplierId      String?                    // congelado na emissão
  createdAt       DateTime     @default(now())

  @@index([tenantId, status, dueAt])
  @@index([tenantId, customerId])
  @@index([tenantId, competenceMonth])
}

model Payment {
  id              String        @id @default(uuid(7))
  tenantId        String
  customerId      String
  status          PaymentStatus @default(CONFIRMED)
  method          PaymentMethod
  amountCents     BigInt
  paidAt          DateTime
  providerCode    String?               // mercadopago | pagbank | manual
  providerPaymentId String?
  providerFeeCents  BigInt?
  receiptUrl      String?
  notes           String?
  registeredBy    String?               // userId, quando manual
  refundedAt      DateTime?
  importBatchId   String?
  createdAt       DateTime      @default(now())

  @@index([tenantId, paidAt])
  @@index([tenantId, customerId])
}

model PaymentAllocation {
  id          String @id @default(uuid(7))
  tenantId    String
  paymentId   String
  chargeId    String
  amountCents BigInt

  @@index([paymentId])
  @@index([chargeId])
}

model LedgerTransaction {            // agrupa lançamentos balanceados
  id          String   @id @default(uuid(7))
  tenantId    String
  kind        String            // charge_issued | payment_received | discount_granted | ...
  description String
  chargeId    String?
  paymentId   String?
  occurredAt  DateTime
  createdAt   DateTime @default(now())

  @@index([tenantId, occurredAt])
}

model LedgerEntry {
  id            String          @id @default(uuid(7))
  tenantId      String
  transactionId String
  customerId    String?
  account       LedgerAccount
  direction     LedgerDirection
  amountCents   BigInt
  occurredAt    DateTime

  @@index([tenantId, customerId, account])
  @@index([transactionId])
}

model DunningPolicy {               // multa e juros
  tenantId          String  @id
  penaltyPercent    Decimal @default(2.0)     // % sobre o principal, uma vez
  interestPercent   Decimal @default(1.0)     // % ao mês, pro rata die
  graceDays         Int     @default(0)
  applyAfterDays    Int     @default(1)
  maxInterestMonths Int     @default(12)
}
```

---

## Comunicação

```prisma
enum ChannelType   { WHATSAPP EMAIL }
enum MessageStatus { QUEUED SENT DELIVERED READ FAILED CANCELED }
enum TemplateKind  { DUNNING WELCOME RENEWAL RECEIPT CUSTOM }

model MessageTemplate {
  id           String       @id @default(uuid(7))
  tenantId     String
  code         String                 // "dunning_d0"
  name         String
  kind         TemplateKind
  channel      ChannelType
  subject      String?                // e-mail
  body         String
  providerTemplateName String?         // nome aprovado na Meta
  providerCategory     String?         // UTILITY | MARKETING | AUTHENTICATION
  approvalStatus       String?         // PENDING | APPROVED | REJECTED
  isDefault    Boolean      @default(false)
  createdAt    DateTime     @default(now())

  @@unique([tenantId, code, channel])
}

model Message {
  id            String        @id @default(uuid(7))
  tenantId      String
  customerId    String
  contactId     String
  channel       ChannelType
  templateId    String?
  chargeId      String?
  dunningStepId String?
  status        MessageStatus @default(QUEUED)
  renderedBody  String
  providerCode  String
  providerMessageId String?
  costCents     BigInt?
  errorCode     String?
  errorMessage  String?
  queuedAt      DateTime      @default(now())
  sentAt        DateTime?
  deliveredAt   DateTime?
  readAt        DateTime?
  failedAt      DateTime?

  @@index([tenantId, status, queuedAt])
  @@index([customerId])
  @@index([chargeId])
}
```

---

## Régua de cobrança

```prisma
enum DunningStatus { DRAFT REVIEW ACTIVE PAUSED }

model DunningRuleset {
  id           String        @id @default(uuid(7))
  tenantId     String
  name         String
  billingModel BillingModel
  status       DunningStatus @default(DRAFT)
  isDefault    Boolean       @default(false)
  quietHoursStart Int        @default(8)    // hora local do tenant
  quietHoursEnd   Int        @default(20)
  skipWeekends    Boolean    @default(false)
  activatedAt  DateTime?
  createdAt    DateTime      @default(now())

  @@index([tenantId, status])
}

model DunningStep {
  id            String      @id @default(uuid(7))
  tenantId      String
  rulesetId     String
  offsetDays    Int                   // negativo = antes do vencimento
  channel       ChannelType
  templateId    String
  conditions    Json?                 // { minAmountCents, planIds, isVip, ... }
  action        String      @default("SEND_MESSAGE")  // ou SUSPEND | NOTIFY_OWNER
  isActive      Boolean     @default(true)
  order         Int

  @@unique([rulesetId, offsetDays, channel])
  @@index([tenantId, rulesetId])
}

model DunningExecution {
  id            String   @id @default(uuid(7))
  tenantId      String
  chargeId      String
  stepId        String
  status        String            // PENDING_REVIEW | EXECUTED | SKIPPED | FAILED
  skipReason    String?
  scheduledFor  DateTime
  executedAt    DateTime?
  messageId     String?

  @@unique([chargeId, stepId])     // ⚠️ idempotência: um passo por cobrança
  @@index([tenantId, status, scheduledFor])
}
```

---

## Integrações

```prisma
enum IntegrationKind   { PAYMENT CHANNEL }
enum IntegrationStatus { DISCONNECTED PENDING_EXTERNAL CONNECTED ERROR }

model Integration {
  id             String            @id @default(uuid(7))
  tenantId       String
  kind           IntegrationKind
  providerCode   String                     // meta | salvy | evolution | mercadopago | pagbank | pix_manual | resend
  status         IntegrationStatus @default(DISCONNECTED)
  displayName    String?
  credentials    Bytes                      // envelope encryption
  credentialsIv  Bytes
  config         Json?                      // não sensível
  capabilities   Json                       // snapshot do que o provider suporta
  lastTestedAt   DateTime?
  lastErrorCode  String?
  lastErrorAt    DateTime?
  healthJson     Json?                      // quality rating, tier, validade de token
  riskAcceptedAt DateTime?                  // ⚠️ aceite de risco (Evolution)
  riskAcceptedBy String?
  connectedAt    DateTime?
  createdAt      DateTime          @default(now())

  @@unique([tenantId, kind, providerCode])
}

model IntegrationLog {
  id            String   @id @default(uuid(7))
  tenantId      String
  integrationId String
  direction     String            // OUTBOUND | INBOUND
  operation     String
  statusCode    Int?
  success       Boolean
  requestId     String?
  errorMessage  String?
  durationMs    Int?
  createdAt     DateTime @default(now())

  @@index([integrationId, createdAt])
}

model WebhookEvent {                // idempotência de webhook recebido
  id            String   @id @default(uuid(7))
  tenantId      String?
  providerCode  String
  externalId    String
  signature     String?
  payload       Json
  processedAt   DateTime?
  errorMessage  String?
  receivedAt    DateTime @default(now())

  @@unique([providerCode, externalId])
}
```

---

## Onboarding, importação, eventos

```prisma
model TenantOnboarding {
  tenantId       String    @id
  cachedProgress Json?
  cachedAt       DateTime?
  dismissedAt    DateTime?
}

model OnboardingStepState {
  tenantId      String
  stepCode      String
  firstViewedAt DateTime?
  completedAt   DateTime?
  skippedAt     DateTime?

  @@id([tenantId, stepCode])
}

enum ImportStatus { UPLOADED ANALYZING MAPPING VALIDATING READY RUNNING DONE FAILED UNDONE }
enum ImportRowStatus { VALID WARNING ERROR IMPORTED SKIPPED }

model ImportBatch {
  id          String       @id @default(uuid(7))
  tenantId    String
  fileName    String
  storageKey  String
  fileHash    String
  sheetName   String?
  headerRow   Int          @default(1)
  status      ImportStatus @default(UPLOADED)
  mode        String       @default("CUSTOMERS_SUBSCRIPTIONS")
  columnMap   Json?
  valueMap    Json?
  transforms  Json?
  options     Json?                    // dedupeKey, skipRetroactive
  stats       Json?
  createdById String
  startedAt   DateTime?
  finishedAt  DateTime?
  undoneAt    DateTime?
  createdAt   DateTime     @default(now())

  @@index([tenantId, status])
}

model ImportRow {
  batchId    String
  rowNumber  Int
  raw        Json
  normalized Json?
  status     ImportRowStatus @default(VALID)
  issues     Json?
  entityIds  Json?

  @@id([batchId, rowNumber])
  @@index([batchId, status])
}

model OutboxEvent {
  id          String    @id @default(uuid(7))
  tenantId    String
  type        String              // charge.paid
  aggregateId String
  payload     Json
  occurredAt  DateTime  @default(now())
  publishedAt DateTime?

  @@index([publishedAt, occurredAt])
}

model AuditLog {
  id         String   @id @default(uuid(7))
  tenantId   String
  userId     String?
  action     String
  entityType String
  entityId   String
  before     Json?
  after      Json?
  ip         String?
  userAgent  String?
  requestId  String?
  createdAt  DateTime @default(now())

  @@index([tenantId, entityType, entityId])
  @@index([tenantId, createdAt])
}

model IdempotencyKey {
  key         String   @id
  tenantId    String
  endpoint    String
  requestHash String
  statusCode  Int?
  response    Json?
  createdAt   DateTime @default(now())
  expiresAt   DateTime

  @@index([expiresAt])
}
```

---

## SQL manual nas migrations ⚠️

O que o `schema.prisma` não expressa e precisa entrar à mão:

```sql
-- 1. Períodos de acesso não sobrepostos (pré-pago)
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE access_periods
  ADD CONSTRAINT access_periods_no_overlap
  EXCLUDE USING gist (
    subscription_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  );

-- 2. Valores sempre positivos; direção separada
ALTER TABLE ledger_entries ADD CONSTRAINT positive_amount CHECK (amount_cents > 0);
ALTER TABLE charges        ADD CONSTRAINT non_negative    CHECK (principal_cents >= 0 AND total_cents >= 0);

-- 3. Um único default de régua por modelo de cobrança
CREATE UNIQUE INDEX one_default_ruleset
  ON dunning_rulesets (tenant_id, billing_model)
  WHERE is_default = true;

-- 4. Um contato primário por tipo por customer
CREATE UNIQUE INDEX one_primary_contact
  ON contacts (customer_id, type) WHERE is_primary = true;

-- 5. RLS em todas as tabelas com tenant_id (ver doc 04)
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON customers
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- 6. Particionamento mensal de logs de alto volume
--    messages, integration_logs, audit_logs → PARTITION BY RANGE (created_at)
--    com pg_cron criando partição do próximo mês
```

⚠️ **Balanceamento do ledger** não é expressável em constraint simples. Implementar como:
(a) função de domínio em `packages/core` que só emite transações balanceadas;
(b) job diário `ledger:verify` que soma débitos e créditos por transação e alerta divergência.
