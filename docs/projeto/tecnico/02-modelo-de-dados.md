# 02 — Modelo de dados

> Sem `tenantId`, sem RLS, sem ledger de partidas dobradas.

## Convenções

| Item | Regra |
|---|---|
| Dinheiro | `BigInt`, sufixo `Cents`. Nunca `Float`, nem em coluna de apoio. |
| Percentual | `Decimal(5,2)` |
| Data | `DateTime` UTC, sufixo `At`. Data sem hora usa `@db.Date`. |
| Id | `uuid(7)` — ordenável por tempo, bom para índice |
| Tabela | `snake_case` plural · Modelo `PascalCase` singular |
| Saldo | ❌ Não existe coluna de saldo. Total é sempre `SUM`. |

## Enums

```prisma
enum SubscriptionStatus { ACTIVE SUSPENDED CANCELLED }
enum BillingCycle       { MONTHLY QUARTERLY SEMIANNUAL ANNUAL }
enum ChargeStatus       { OPEN OVERDUE PARTIALLY_PAID PAID CANCELLED }
enum PaymentMethod      { PIX CASH TRANSFER CARD OTHER }
enum PaymentSource      { MANUAL WEBHOOK }
enum DiscountType       { PERCENT FIXED }
enum ChannelProvider    { META_CLOUD EVOLUTION SALVY }
enum DunningStatus      { DRAFT REVIEW ACTIVE PAUSED }
enum DunningAction      { SEND_MESSAGE SUSPEND NOTIFY_OWNER }
enum MessageKind        { DUNNING MANUAL TEST }
enum MessageStatus      { PENDING SENT FAILED CANCELLED SKIPPED }
enum ExecutionOutcome   { QUEUED SKIPPED PENDING_REVIEW }
```

---

## Operação

```prisma
model User {
  id           String   @id @default(uuid(7))
  email        String   @unique
  name         String
  passwordHash String                      // argon2id
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@map("users")
}

/// Linha única. Id fixo "singleton" — garante que não existam duas.
model Settings {
  id                  String   @id @default("singleton")
  businessName        String
  timezone            String   @default("America/Sao_Paulo")
  quietHourStart      Int      @default(8)     // hora local, inclusive
  quietHourEnd        Int      @default(20)    // hora local, exclusiva
  sendingPaused       Boolean  @default(false) // kill switch — T8
  pixKey              String?
  pixHolderName       String?
  marginAlertPercent  Decimal  @default(30) @db.Decimal(5, 2)
  updatedAt           DateTime @updatedAt

  @@map("settings")
}
```

---

## Catálogo

```prisma
model Supplier {
  id             String   @id @default(uuid(7))
  name           String   @unique
  unitCostCents  BigInt   @default(0)      // custo padrão por ciclo
  notes          String?
  isActive       Boolean  @default(true)
  createdAt      DateTime @default(now())

  plans          Plan[]
  subscriptions  Subscription[]
  charges        Charge[]

  @@map("suppliers")
}

model Plan {
  id             String        @id @default(uuid(7))
  name           String        @unique
  priceCents     BigInt        @default(0)   // sugestão; o valor real vive na assinatura
  costCents      BigInt        @default(0)
  cycle          BillingCycle  @default(MONTHLY)
  supplierId     String?
  isActive       Boolean       @default(true)
  createdAt      DateTime      @default(now())

  supplier       Supplier?     @relation(fields: [supplierId], references: [id])
  subscriptions  Subscription[]

  @@map("plans")
}
```

⚠️ `Plan.priceCents` é sugestão preenchida no formulário. A fonte da verdade do valor cobrado é `Subscription.priceCents` — o operador negocia preço por cliente, e mudar o plano não pode alterar retroativamente o que alguém paga.

---

## Cliente

```prisma
model Customer {
  id             String   @id @default(uuid(7))
  name           String
  phone          String                     // E.164: +5511999998888
  email          String?
  document       String?                    // CPF/CNPJ, opcional
  notes          String?
  optedOut       Boolean  @default(false)   // T5 — bloqueia envio em todos os canais
  optedOutAt     DateTime?
  optedOutReason String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  subscriptions  Subscription[]
  charges        Charge[]
  messages       Message[]

  @@unique([phone])
  @@index([name])
  @@map("customers")
}
```

⚠️ `phone` é único. Duas linhas com o mesmo telefone quebram a deduplicação diária (T7) e o opt-out. A importação precisa consolidar antes de gravar.

---

## Assinatura

```prisma
model Subscription {
  id                 String              @id @default(uuid(7))
  customerId         String
  planId             String?
  supplierId         String?

  priceCents         BigInt                            // o que o cliente paga por ciclo
  costCents          BigInt              @default(0)   // o que custa por ciclo
  cycle              BillingCycle        @default(MONTHLY)

  dueDayAnchor       Int                               // 1..31 — âncora, ver doc 03
  nextDueAt          DateTime                          // 23:59:59 local, em UTC
  startedAt          DateTime            @default(now())

  discountType       DiscountType?
  discountValue      Decimal?            @db.Decimal(10, 2)
  discountUntil      DateTime?                         // null = permanente

  status             SubscriptionStatus  @default(ACTIVE)
  suspendedAt        DateTime?
  cancelledAt        DateTime?
  cancelReason       String?

  // acesso do assinante ao serviço — ver doc 05
  accessUsername     String?
  accessPasswordEnc  String?                           // AES-256-GCM
  accessServer       String?
  screens            Int                 @default(1)
  accessNotes        String?

  createdAt          DateTime            @default(now())
  updatedAt          DateTime            @updatedAt

  customer           Customer            @relation(fields: [customerId], references: [id])
  plan               Plan?               @relation(fields: [planId], references: [id])
  supplier           Supplier?           @relation(fields: [supplierId], references: [id])
  charges            Charge[]

  @@index([status, nextDueAt])
  @@index([customerId])
  @@index([supplierId])
  @@map("subscriptions")
}
```

Notas:

- `supplierId` é **copiado do plano na criação** e passa a ser a fonte da verdade. O operador migra um cliente de fornecedor sem trocar o plano dele.
- `dueDayAnchor` é a âncora, não o dia efetivo. Cliente com âncora 31 vence dia 28 em fevereiro e volta para 31 em março. ⚠️ **Nunca sobrescrever a âncora com o dia efetivo** — ver [`03-datas-e-ciclos.md`](./03-datas-e-ciclos.md).
- `nextDueAt` é cache do próximo vencimento, para a query do painel não recalcular a base inteira. Recalculado a cada emissão de cobrança.

---

## Cobrança e pagamento

```prisma
model Charge {
  id              String        @id @default(uuid(7))
  subscriptionId  String
  customerId      String                              // denormalizado — a query por cliente é constante
  supplierId      String?                             // congelado na emissão

  principalCents  BigInt                              // valor cheio do ciclo
  discountCents   BigInt        @default(0)
  costCents       BigInt        @default(0)           // ⚠ congelado na emissão, nunca recalculado

  periodStart     DateTime      @db.Date              // início do ciclo coberto
  periodEnd       DateTime      @db.Date
  dueAt           DateTime                            // 23:59:59 local, em UTC
  issuedAt        DateTime      @default(now())

  status          ChargeStatus  @default(OPEN)
  paidAt          DateTime?
  cancelledAt     DateTime?
  cancelReason    String?

  subscription    Subscription  @relation(fields: [subscriptionId], references: [id])
  customer        Customer      @relation(fields: [customerId], references: [id])
  supplier        Supplier?     @relation(fields: [supplierId], references: [id])
  payments        Payment[]
  executions      DunningExecution[]
  messages        Message[]

  @@unique([subscriptionId, periodStart])             // ⚠ idempotência da geração
  @@index([status, dueAt])
  @@index([customerId, dueAt])
  @@map("charges")
}

model Payment {
  id           String         @id @default(uuid(7))
  chargeId     String
  amountCents  BigInt
  method       PaymentMethod  @default(PIX)
  source       PaymentSource  @default(MANUAL)
  externalId   String?                                // reservado para a conciliação futura
  paidAt       DateTime                               // quando o dinheiro entrou, não quando foi registrado
  note         String?
  createdAt    DateTime       @default(now())

  charge       Charge         @relation(fields: [chargeId], references: [id])

  @@unique([source, externalId])                      // dedupe de webhook, quando existir
  @@index([chargeId])
  @@index([paidAt])
  @@map("payments")
}
```

Regras duras:

- **`amount_cents > 0`** em `payments`, por `CHECK` na migration. Estorno é registro de sinal contrário em fase futura, não valor negativo aqui.
- **Cobrança com pagamento registrado não é cancelada nem editada.** O `service` recusa; a UI nem oferece.
- `Charge.status` é derivado da soma dos pagamentos e **gravado** — é estado, não saldo. O total pago continua sendo `SUM(payments.amountCents)`, calculado na query.
- `periodStart` é a chave de idempotência. Ciclo trimestral que começa em 01/03 gera exatamente uma cobrança, quantas vezes o job rodar.

⚠️ Multa e juros por atraso **não estão no escopo B**. Se entrarem, são colunas novas (`lateFeeCents`, `interestCents`) e recálculo idempotente sobre o principal — nunca sobre o total com encargos.

---

## Régua

```prisma
model DunningRule {
  id         String         @id @default(uuid(7))
  name       String
  status     DunningStatus  @default(DRAFT)
  isDefault  Boolean        @default(false)
  createdAt  DateTime       @default(now())
  updatedAt  DateTime       @updatedAt

  steps      DunningStep[]

  @@map("dunning_rules")
}

model DunningStep {
  id           String           @id @default(uuid(7))
  ruleId       String
  offsetDays   Int                             // negativo = antes do vencimento
  action       DunningAction    @default(SEND_MESSAGE)
  templateBody String?                         // com variáveis {{...}}
  isActive     Boolean          @default(true)

  rule         DunningRule      @relation(fields: [ruleId], references: [id], onDelete: Cascade)
  executions   DunningExecution[]

  @@unique([ruleId, offsetDays])
  @@map("dunning_steps")
}

model DunningExecution {
  id         String            @id @default(uuid(7))
  chargeId   String
  stepId     String
  outcome    ExecutionOutcome
  reason     String?                           // opted_out | no_phone | quiet_hours | daily_dedupe | paused | review
  messageId  String?           @unique
  createdAt  DateTime          @default(now())

  charge     Charge            @relation(fields: [chargeId], references: [id], onDelete: Cascade)
  step       DunningStep       @relation(fields: [stepId], references: [id], onDelete: Cascade)
  message    Message?          @relation(fields: [messageId], references: [id])

  @@unique([chargeId, stepId])                 // ⚠ idempotência do passo
  @@map("dunning_executions")
}
```

⚠️ `@@unique([chargeId, stepId])` é o que garante que o job rodando duas vezes no mesmo dia não dispare a mesma mensagem duas vezes. É a trava mais importante da tabela.

---

## Mensagens e canais

```prisma
model ChannelConfig {
  id           String           @id @default(uuid(7))
  provider     ChannelProvider  @unique
  label        String
  isActive     Boolean          @default(false)
  isDefault    Boolean          @default(false)
  phoneNumber  String?                          // número remetente
  credentials  String                           // JSON criptografado — ver doc 05
  lastCheckAt  DateTime?
  lastCheckOk  Boolean?
  lastError    String?
  createdAt    DateTime         @default(now())
  updatedAt    DateTime         @updatedAt

  messages     Message[]

  @@map("channel_configs")
}

model Message {
  id            String            @id @default(uuid(7))
  customerId    String
  chargeId      String?
  channelId     String?
  kind          MessageKind       @default(DUNNING)
  status        MessageStatus     @default(PENDING)

  toPhone       String
  body          String
  scheduledFor  DateTime                         // quando pode sair, já dentro da quiet hour
  scheduledDate DateTime          @db.Date       // dia local — chave da dedupe T7
  sentAt        DateTime?
  externalId    String?                          // id do provider
  attempts      Int               @default(0)
  failReason    String?
  cancelReason  String?
  createdAt     DateTime          @default(now())

  customer      Customer          @relation(fields: [customerId], references: [id])
  charge        Charge?           @relation(fields: [chargeId], references: [id])
  channel       ChannelConfig?    @relation(fields: [channelId], references: [id])
  execution     DunningExecution?

  @@index([status, scheduledFor])
  @@index([customerId, createdAt])
  @@map("messages")
}
```

### SQL manual que a migration precisa ter

O `schema.prisma` não expressa tudo. Estes vão escritos à mão na migration:

```sql
-- T7: um customer recebe no máximo uma mensagem de cobrança por dia
CREATE UNIQUE INDEX messages_dunning_daily_dedupe
  ON messages (customer_id, scheduled_date)
  WHERE kind = 'DUNNING' AND status <> 'CANCELLED';

-- Settings é linha única
CREATE UNIQUE INDEX settings_singleton ON settings ((id = 'singleton')) WHERE id = 'singleton';

-- Dinheiro não é negativo
ALTER TABLE payments      ADD CONSTRAINT payments_amount_positive  CHECK (amount_cents > 0);
ALTER TABLE charges       ADD CONSTRAINT charges_principal_nonneg  CHECK (principal_cents >= 0);
ALTER TABLE charges       ADD CONSTRAINT charges_cost_nonneg       CHECK (cost_cents >= 0);
ALTER TABLE charges       ADD CONSTRAINT charges_discount_bounded  CHECK (discount_cents >= 0 AND discount_cents <= principal_cents);
ALTER TABLE subscriptions ADD CONSTRAINT subs_anchor_range         CHECK (due_day_anchor BETWEEN 1 AND 31);

-- Apenas um canal padrão
CREATE UNIQUE INDEX channel_configs_single_default ON channel_configs (is_default) WHERE is_default;
```

---

## Lead

Alimentada pelo formulário do site de captação — ver [`08-site.md`](./08-site.md).

```prisma
model Lead {
  id            String    @id @default(uuid(7))
  name          String
  phone         String                          // E.164
  city          String?
  interestPlan  String?                         // texto livre, vem do site
  source        String                          // utm_source ou "site"
  campaign      String?                         // utm_campaign
  landingPath   String?                         // qual página converteu
  status        String    @default("NEW")       // NEW | CONTACTED | CONVERTED | DISCARDED
  customerId    String?                         // preenchido ao converter
  note          String?
  createdAt     DateTime  @default(now())

  @@index([status, createdAt])
  @@index([phone])
  @@map("leads")
}
```

⚠️ Esta é a **única** tabela escrita por um endpoint público. Exige, no mesmo PR:

- Token do Cloudflare Turnstile validado no servidor
- Rate limit por IP, contado em tabela — sem Redis
- Validação Zod estrita, com limite de tamanho em cada campo
- `CHECK` de tamanho no banco: `name` ≤ 120, `phone` ≤ 20, `note` ≤ 500

Sem os quatro, é um formulário de spam com acesso direto ao banco.

⚠️ `phone` **não** é único aqui. A mesma pessoa pode preencher duas vezes, e recusar o segundo envio esconde um lead real. A deduplicação acontece na tela, não no schema.

---

## Auditoria de credencial

```prisma
model CredentialReveal {
  id              String   @id @default(uuid(7))
  subscriptionId  String
  userId          String
  revealedAt      DateTime @default(now())
  ip              String?

  @@index([subscriptionId, revealedAt])
  @@map("credential_reveals")
}
```

⚠️ Gravado **toda vez** que a senha de acesso é revelada na tela. Não é opcional — é o que permite responder "quem viu essa credencial" se o cliente perguntar. Ver [`05-credenciais-e-seguranca.md`](./05-credenciais-e-seguranca.md).

---

## Migrations

- Migration aplicada é imutável. Corrigir é migration nova.
- Índice parcial, `CHECK` e o índice de singleton entram como SQL manual, e isso fica registrado no `README` do `prisma/`.
- Alteração destrutiva usa expand/contract: adiciona, migra o dado, passa a ler do novo, remove numa migration posterior.
