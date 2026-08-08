# Etapa 2 — Cobrança Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emissão automática de cobrança (na criação da assinatura e no pagamento total), registro de pagamento total/parcial sem duplicar, cancelamento bloqueado por pagamento, job diário de atraso, painel de vencimentos, lista de cobranças e histórico na ficha do cliente.

**Architecture:** Segue o padrão já estabelecido nas Etapas 1a/1b — `app/` lê via Server Component, `features/charges/actions.ts` escreve via Server Action, `features/charges/service.ts` orquestra numa transação, `core/billing.ts` e `core/dates.ts` calculam puro. Emissão de `Charge` na criação de assinatura fica dentro de `features/subscriptions/service.ts` (mesma transação), escrevendo `Charge` direto via Prisma — **não** importando `features/charges/service.ts` (regra de arquitetura: uma feature não importa de outra; acesso direto ao Prisma de outra tabela dentro da própria transação não é import de feature, é o padrão já usado no exemplo de `tx.message.updateMany(...)` de `02-servidor.md`).

**Tech Stack:** Next.js App Router, Prisma, `date-fns` + `@date-fns/tz` (já em uso), `decimal.js` (já em uso), `google-auth-library` (nova dependência, só pra verificação OIDC do cron).

## Global Constraints

- `BigInt` em centavos, sufixo `Cents`, sempre. Nunca `number`/`float`, nem em variável temporária. Arredondamento round-half-up, uma vez, no fim (`core/money.ts#divRoundHalfUp`, já existe).
- `Charge.principalCents`/`costCents` congelados na emissão — nunca recalculados depois.
- Nenhuma coluna de saldo. Total pago é sempre `SUM(payments.amountCents)`.
- `now` entra por parâmetro em toda função de `core/` e em todo handler de cron — nunca `new Date()` dentro de `core/`.
- Uma transação por operação de negócio (emissão + o que ela dispara, pagamento + o que ele dispara).
- `revalidatePath` sempre depois da transação, nunca dentro.
- DTO explícito nas queries — nenhum modelo Prisma cruza pra Server/Client Component. `BigInt` vira `string` na borda do servidor.
- Toda entrada de Server Action passa por Zod. Erro de negócio é `DomainError` com `code`, mensagem pt-BR.
- Endpoint de cron sem token válido devolve 401 sem corpo. Handler idempotente por natureza (garantido pela função pura de derivação de status, não por `if`).
- Falha por linha no job não derruba a passada inteira — captura, loga, continua.
- Sem `console.log`. Log estruturado com `logger`, nunca objeto inteiro nem dado sensível.
- Rotas da UI em inglês (`/charges`), labels em pt-BR ("Cobranças") — mesmo padrão de `/customers`. O `Sidebar` hoje aponta pra `/cobrancas`; corrige pra `/charges` como parte deste plano (inconsistência herdada, único lugar do código que ainda usa rota em português).
- Commits em Conventional Commits, subject ≤72 chars.

---

### Task 1: Schema — `Charge`, `Payment`, enums, migration manual

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/00000000000004_charges_and_payments/migration.sql`
- Modify: `docs/projeto/tecnico/02-modelo-de-dados.md` (remove o `CHECK subs_anchor_range` órfão do SQL manual — coluna `due_day_anchor` não existe mais desde o pivô de vencimento por pagamento)

**Interfaces:**
- Produces: modelos Prisma `Charge`, `Payment`, enums `ChargeStatus`, `PaymentMethod`, `PaymentSource` — consumidos por todas as tasks seguintes.

- [ ] **Step 1: Adicionar enums e modelos ao `prisma/schema.prisma`**

Adicionar após o enum `DiscountType` existente:

```prisma
enum ChargeStatus {
  OPEN
  OVERDUE
  PARTIALLY_PAID
  PAID
  CANCELLED
}

enum PaymentMethod {
  PIX
  CASH
  TRANSFER
  CARD
  OTHER
}

enum PaymentSource {
  MANUAL
  WEBHOOK
}
```

Adicionar os modelos (campo a campo, exatamente como em `02-modelo-de-dados.md`, mais `idempotencyKey`):

```prisma
model Charge {
  id              String        @id @default(uuid(7))
  subscriptionId  String
  customerId      String
  supplierId      String?

  principalCents  BigInt
  discountCents   BigInt        @default(0)
  costCents       BigInt        @default(0)

  periodStart     DateTime      @db.Date
  periodEnd       DateTime      @db.Date
  dueAt           DateTime
  issuedAt        DateTime      @default(now())

  status          ChargeStatus  @default(OPEN)
  paidAt          DateTime?
  cancelledAt     DateTime?
  cancelReason    String?

  subscription    Subscription  @relation(fields: [subscriptionId], references: [id])
  customer        Customer      @relation(fields: [customerId], references: [id])
  supplier        Supplier?     @relation(fields: [supplierId], references: [id])
  payments        Payment[]

  @@unique([subscriptionId, periodStart])
  @@index([status, dueAt])
  @@index([customerId, dueAt])
  @@map("charges")
}

model Payment {
  id             String         @id @default(uuid(7))
  chargeId       String
  amountCents    BigInt
  method         PaymentMethod  @default(PIX)
  source         PaymentSource  @default(MANUAL)
  externalId     String?
  idempotencyKey String?        @unique
  paidAt         DateTime
  note           String?
  createdAt      DateTime       @default(now())

  charge         Charge         @relation(fields: [chargeId], references: [id])

  @@unique([source, externalId])
  @@index([chargeId])
  @@index([paidAt])
  @@map("payments")
}
```

Adicionar as relações inversas nos modelos existentes — em `Subscription`, depois de `supplier`:

```prisma
  charges           Charge[]
```

Em `Customer`, depois de `subscriptions`:

```prisma
  charges        Charge[]
```

Em `Supplier` (ler o modelo primeiro pra achar o ponto certo), adicionar:

```prisma
  charges       Charge[]
```

- [ ] **Step 2: Gerar e escrever a migration manual**

```bash
mkdir -p "prisma/migrations/00000000000004_charges_and_payments"
```

`prisma/migrations/00000000000004_charges_and_payments/migration.sql` — rodar primeiro `pnpm exec prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script` não se aplica aqui (schema já mudou); em vez disso, usar `pnpm exec prisma migrate dev --create-only --name charges_and_payments` pra deixar o Prisma gerar o `CREATE TABLE`/`CREATE TYPE` base, depois **editar o arquivo gerado** pra acrescentar os `CHECK`s e o índice único parcial manuais no fim:

```sql
-- (conteúdo gerado pelo Prisma para CREATE TYPE "ChargeStatus"/"PaymentMethod"/"PaymentSource",
--  CREATE TABLE "charges", CREATE TABLE "payments", índices simples e FKs — não reescrever à mão,
--  conferir que bateu com o schema.prisma acima)

-- Dinheiro não é negativo
ALTER TABLE payments ADD CONSTRAINT payments_amount_positive CHECK (amount_cents > 0);
ALTER TABLE charges  ADD CONSTRAINT charges_principal_nonneg CHECK (principal_cents >= 0);
ALTER TABLE charges  ADD CONSTRAINT charges_cost_nonneg      CHECK (cost_cents >= 0);
ALTER TABLE charges  ADD CONSTRAINT charges_discount_bounded CHECK (discount_cents >= 0 AND discount_cents <= principal_cents);

-- No máximo uma cobrança aberta por assinatura
CREATE UNIQUE INDEX subscriptions_single_open_charge ON charges (subscription_id)
  WHERE status IN ('OPEN', 'OVERDUE', 'PARTIALLY_PAID');
```

- [ ] **Step 3: Aplicar e gerar client**

```bash
docker compose up -d db
pnpm db:migrate
pnpm exec prisma generate
```

- [ ] **Step 4: Confirmar constraint com inserção real (não confiar só no `schema.prisma`)**

```bash
docker exec mt-conexoes-db psql -U mtconexoes -d mtconexoes -c "
INSERT INTO payments (id, \"chargeId\", amount_cents, method, source, paid_at, \"createdAt\")
  VALUES ('test-neg', (SELECT id FROM charges LIMIT 1), -100, 'PIX', 'MANUAL', now(), now());
"
```

Esperado: erro de `CHECK` (se não houver nenhuma `charges` ainda, pular este passo — a tabela estará vazia logo após a migration, o que é esperado; a constraint será exercida de verdade pelos testes de integração das próximas tasks).

- [ ] **Step 5: Remover o `CHECK` órfão de `02-modelo-de-dados.md`**

Ler o arquivo, achar a linha `ALTER TABLE subscriptions ADD CONSTRAINT subs_anchor_range CHECK (due_day_anchor BETWEEN 1 AND 31);` no bloco "SQL manual que a migration precisa ter", remover — a coluna `due_day_anchor` não existe no schema atual (pivô pra vencimento por data de pagamento, documentado em `CLAUDE.md`). Adicionar uma nota curta acima do bloco removido explicando que foi tirado por estar órfão desde o pivô.

- [ ] **Step 6: Verificar e commitar**

```bash
pnpm typecheck && pnpm lint && pnpm build
```

```bash
git add prisma docs/projeto/tecnico/02-modelo-de-dados.md
git commit -m "feat(db): add Charge and Payment models"
```

---

### Task 2: `core/dates.ts#localDateOnly` — data local sem hora, para colunas `@db.Date`

**Files:**
- Modify: `src/core/dates.ts`
- Modify: `src/core/dates.test.ts`

**Interfaces:**
- Produces: `localDateOnly(instant: Date, timezone: string): Date` — usado por `features/subscriptions/service.ts` e `features/charges/service.ts` (Tasks 5 e 6) pra preencher `Charge.periodStart`/`periodEnd`.

- [ ] **Step 1: Escrever o teste que falha**

Adicionar a `src/core/dates.test.ts` (ler o arquivo primeiro pra seguir o estilo dos testes existentes):

```ts
describe('localDateOnly', () => {
  it('extrai a data local sem componente de hora', () => {
    // 2026-08-10T23:59:59.999Z é 20:59:59 de 10/08 em America/Sao_Paulo (UTC-3)
    const result = localDateOnly(new Date('2026-08-10T23:59:59.999Z'), 'America/Sao_Paulo');
    expect(result.toISOString()).toBe('2026-08-10T00:00:00.000Z');
  });

  it('vira o dia certo quando o instante UTC já passou da meia-noite local do dia seguinte', () => {
    // 2026-08-11T02:00:00.000Z é 23:00 de 10/08 em America/Sao_Paulo — ainda dia 10 local
    const result = localDateOnly(new Date('2026-08-11T02:00:00.000Z'), 'America/Sao_Paulo');
    expect(result.toISOString()).toBe('2026-08-10T00:00:00.000Z');
  });

  it('é independente do fuso do processo — mesmo resultado sob TZ diferente', () => {
    const original = process.env.TZ;
    process.env.TZ = 'UTC';
    try {
      const result = localDateOnly(new Date('2026-08-10T23:59:59.999Z'), 'America/Sao_Paulo');
      expect(result.toISOString()).toBe('2026-08-10T00:00:00.000Z');
    } finally {
      process.env.TZ = original;
    }
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm test -- dates`
Expected: FAIL — `localDateOnly` não existe.

- [ ] **Step 3: Implementar em `src/core/dates.ts`**

Adicionar ao final do arquivo:

```ts
/** Data local sem hora (meia-noite UTC do dia local), para colunas @db.Date. */
export function localDateOnly(instant: Date, timezone: string): Date {
  const local = new TZDate(instant, timezone);
  return new Date(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()));
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm test -- dates`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/dates.ts src/core/dates.test.ts
git commit -m "feat(core): add localDateOnly for date-only columns"
```

---

### Task 3: `core/billing.ts#deriveChargeStatus`

**Files:**
- Create: `src/core/billing.ts`
- Create: `src/core/billing.test.ts`

**Interfaces:**
- Produces: `deriveChargeStatus(params: { netCents: bigint; paidCents: bigint; dueAt: Date; now: Date }): 'OPEN' | 'OVERDUE' | 'PARTIALLY_PAID' | 'PAID'` — consumido por `features/charges/service.ts#registerPayment` (Task 6) e por `app/api/cron/charges-mark-overdue/route.ts` (Task 8).

- [ ] **Step 1: Escrever os testes que falham**

`src/core/billing.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { deriveChargeStatus } from './billing';

const DUE = new Date('2026-08-10T23:59:59.999Z'); // 23:59:59 local já em UTC

describe('deriveChargeStatus', () => {
  it('sem pagamento e antes do vencimento é OPEN', () => {
    const status = deriveChargeStatus({ netCents: 10_000n, paidCents: 0n, dueAt: DUE, now: new Date('2026-08-05T12:00:00Z') });
    expect(status).toBe('OPEN');
  });

  it('sem pagamento e depois do vencimento é OVERDUE', () => {
    const status = deriveChargeStatus({ netCents: 10_000n, paidCents: 0n, dueAt: DUE, now: new Date('2026-08-11T00:00:01Z') });
    expect(status).toBe('OVERDUE');
  });

  it('pagamento parcial antes do vencimento é PARTIALLY_PAID', () => {
    const status = deriveChargeStatus({ netCents: 10_000n, paidCents: 4_000n, dueAt: DUE, now: new Date('2026-08-05T12:00:00Z') });
    expect(status).toBe('PARTIALLY_PAID');
  });

  it('pagamento parcial depois do vencimento é OVERDUE, não PARTIALLY_PAID', () => {
    const status = deriveChargeStatus({ netCents: 10_000n, paidCents: 4_000n, dueAt: DUE, now: new Date('2026-08-11T00:00:01Z') });
    expect(status).toBe('OVERDUE');
  });

  it('pagamento igual ao net é PAID, mesmo depois do vencimento', () => {
    const status = deriveChargeStatus({ netCents: 10_000n, paidCents: 10_000n, dueAt: DUE, now: new Date('2026-09-01T00:00:00Z') });
    expect(status).toBe('PAID');
  });

  it('pagamento acima do net (não deveria acontecer, mas não quebra) ainda é PAID', () => {
    const status = deriveChargeStatus({ netCents: 10_000n, paidCents: 10_500n, dueAt: DUE, now: new Date('2026-08-05T12:00:00Z') });
    expect(status).toBe('PAID');
  });

  it('cobrança de 0 centavos com 0 pago é PAID, não OPEN (nada a cobrar)', () => {
    const status = deriveChargeStatus({ netCents: 0n, paidCents: 0n, dueAt: DUE, now: new Date('2026-08-05T12:00:00Z') });
    expect(status).toBe('PAID');
  });

  it('vencimento exatamente igual a now ainda não é OVERDUE (dueAt é inclusive)', () => {
    const status = deriveChargeStatus({ netCents: 10_000n, paidCents: 0n, dueAt: DUE, now: DUE });
    expect(status).toBe('OPEN');
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm test -- billing`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar `src/core/billing.ts`**

```ts
export type DerivedChargeStatus = 'OPEN' | 'OVERDUE' | 'PARTIALLY_PAID' | 'PAID';

/**
 * Deriva o status de uma cobrança a partir do saldo e do vencimento. Nunca
 * devolve CANCELLED — cancelamento é ação explícita (features/charges/service.ts),
 * não derivada aqui. `now` entra por parâmetro, nunca `new Date()` interno.
 */
export function deriveChargeStatus(params: {
  netCents: bigint;
  paidCents: bigint;
  dueAt: Date;
  now: Date;
}): DerivedChargeStatus {
  if (params.paidCents >= params.netCents) return 'PAID';
  if (params.now > params.dueAt) return 'OVERDUE';
  if (params.paidCents > 0n) return 'PARTIALLY_PAID';
  return 'OPEN';
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm test -- billing`
Expected: PASS, todos os 8 casos verdes.

- [ ] **Step 5: Commit**

```bash
git add src/core/billing.ts src/core/billing.test.ts
git commit -m "feat(core): add deriveChargeStatus for charge status transitions"
```

---

### Task 4: Autenticação OIDC do Cloud Scheduler

**Files:**
- Modify: `package.json` (nova dependência `google-auth-library`)
- Modify: `src/lib/cron-auth.ts`
- Create: `src/lib/cron-auth.test.ts`
- Modify: `docker-compose.yml` (adicionar `/api/cron/charges-mark-overdue` ao `CRON_ENDPOINTS` do `cron-sim`)

**Interfaces:**
- Produces: `assertCloudSchedulerToken(req: Request): Promise<void>` — usado por `app/api/cron/charges-mark-overdue/route.ts` (Task 8). Lança em caso de token ausente/inválido.
- Mantém: `assertCronRequest(req: Request): void` (já existe, usado por `cron/ping`) — sem mudança, continua servindo o endpoint de health-check que não escreve no banco.

Contexto: `src/lib/cron-auth.ts` já tem o comentário "trocar por verificação real (google-auth-library) antes da Etapa 2, quando os jobs de negócio existirem" — `docs/projeto/tecnico/05-credenciais-e-seguranca.md` confirma: "Cloud Scheduler chama com token OIDC. O handler valida emissor e audiência com `google-auth-library`; token ausente ou inválido devolve 401 sem corpo." Este é o job de negócio que dispara essa exigência.

- [ ] **Step 1: Instalar dependência**

```bash
pnpm add google-auth-library
```

- [ ] **Step 2: Escrever o teste que falha**

`src/lib/cron-auth.test.ts` (ler `src/lib/cron-auth.ts` atual primeiro pra não quebrar o teste de `assertCronRequest` se já existir um):

```ts
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { assertCloudSchedulerToken } from './cron-auth';

describe('assertCloudSchedulerToken', () => {
  const original = { ...process.env };

  beforeEach(() => {
    process.env.NODE_ENV = 'production';
    process.env.CRON_OIDC_AUDIENCE = 'https://app.example.com/api/cron/charges-mark-overdue';
  });

  afterEach(() => {
    process.env = { ...original };
  });

  it('rejeita requisição sem header Authorization', async () => {
    const req = new Request('https://app.example.com/api/cron/charges-mark-overdue', { method: 'POST' });
    await expect(assertCloudSchedulerToken(req)).rejects.toThrow();
  });

  it('rejeita token malformado', async () => {
    const req = new Request('https://app.example.com/api/cron/charges-mark-overdue', {
      method: 'POST',
      headers: { authorization: 'Bearer token-invalido' },
    });
    await expect(assertCloudSchedulerToken(req)).rejects.toThrow();
  });

  it('em desenvolvimento, aceita o bearer token fixo CRON_SECRET (mesmo mecanismo do assertCronRequest)', async () => {
    process.env.NODE_ENV = 'development';
    process.env.CRON_SECRET = 'dev-cron-secret';
    const req = new Request('https://app.example.com/api/cron/charges-mark-overdue', {
      method: 'POST',
      headers: { authorization: 'Bearer dev-cron-secret' },
    });
    await expect(assertCloudSchedulerToken(req)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2b: Rodar e confirmar que falha**

Run: `pnpm test -- cron-auth`
Expected: FAIL — `assertCloudSchedulerToken` não existe.

- [ ] **Step 3: Implementar em `src/lib/cron-auth.ts`**

Ler o arquivo atual primeiro, manter `assertCronRequest` intacto, adicionar:

```ts
import { OAuth2Client } from 'google-auth-library';
import { requireEnv } from './env';

const oidcClient = new OAuth2Client();

/**
 * Produção: Cloud Scheduler chama com token OIDC assinado pelo Google —
 * valida emissor e audiência antes de aceitar. Desenvolvimento: sem
 * infraestrutura de OIDC local, aceita o mesmo bearer token fixo do
 * cron-sim (CRON_SECRET) — mesmo mecanismo de assertCronRequest, pra não
 * duplicar o dev-token em dois lugares com semânticas diferentes.
 */
export async function assertCloudSchedulerToken(req: Request): Promise<void> {
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) throw new Error('unauthorized');
  const token = auth.slice('Bearer '.length);

  if (process.env.NODE_ENV !== 'production') {
    if (token !== requireEnv('CRON_SECRET')) throw new Error('unauthorized');
    return;
  }

  const audience = requireEnv('CRON_OIDC_AUDIENCE');
  const ticket = await oidcClient.verifyIdToken({ idToken: token, audience });
  const payload = ticket.getPayload();
  if (!payload || payload.iss !== 'https://accounts.google.com') {
    throw new Error('unauthorized');
  }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm test -- cron-auth`
Expected: PASS.

- [ ] **Step 5: Atualizar `docker-compose.yml`**

Ler o arquivo, no serviço `cron-sim`, mudar:

```yaml
      CRON_ENDPOINTS: /api/cron/ping
```

para:

```yaml
      CRON_ENDPOINTS: /api/cron/ping,/api/cron/charges-mark-overdue
```

(confirmar primeiro, lendo `docker/cron-sim/entrypoint.sh`, que o script já suporta lista separada por vírgula — se não suportar, ajustar o script também, sem mudar a assinatura dos outros endpoints.)

- [ ] **Step 6: Verificar e commitar**

```bash
pnpm typecheck && pnpm lint && pnpm build
```

```bash
git add package.json pnpm-lock.yaml src/lib/cron-auth.ts src/lib/cron-auth.test.ts docker-compose.yml
git commit -m "feat(cron): add Cloud Scheduler OIDC verification for business jobs"
```

---

### Task 5: Emissão da primeira `Charge` na criação da assinatura

**Files:**
- Modify: `src/features/subscriptions/service.ts`
- Create: `src/features/subscriptions/service.integration.test.ts` (se não existir — ler primeiro; se já existir, adicionar os casos a ele)

**Interfaces:**
- Consumes: `deriveChargeStatus` não é usado aqui (charge nasce sempre `OPEN`); `localDateOnly`, `firstDueDate` de `core/dates.ts`; `applyPercent` de `core/money.ts` (Task 1, 2, 3 já entregues).
- Produces: `createSubscription` passa a emitir `Charge` como efeito colateral, dentro da mesma transação — nenhuma mudança de assinatura pública da função (mesmos parâmetros, mesmo retorno).

- [ ] **Step 1: Ler o `createSubscription` atual e o schema de `Charge`**

Confirmar os nomes exatos de campo antes de escrever o teste (já levantados no spec, mas conferir contra o schema real gerado na Task 1).

- [ ] **Step 2: Escrever o teste de integração que falha**

Adicionar (ou criar) `src/features/subscriptions/service.integration.test.ts`:

```ts
it('assinatura ACTIVE emite a primeira Charge na criação', async () => {
  const customer = await db.customer.create({ data: { name: 'Cliente Cobrança Teste' } });
  const subscription = await createSubscription(customer.id, {
    planId: '', supplierId: '', priceCents: '10000', costCents: '3000', cycle: 'MONTHLY',
    discountType: '', discountValue: '', discountUntil: '',
    accessUsername: '', accessPassword: '', accessServer: '', screens: 1, accessNotes: '',
  });

  const charge = await db.charge.findFirst({ where: { subscriptionId: subscription.id } });
  expect(charge).not.toBeNull();
  expect(charge!.status).toBe('OPEN');
  expect(charge!.principalCents.toString()).toBe('10000');
  expect(charge!.costCents.toString()).toBe('3000');
  expect(charge!.discountCents.toString()).toBe('0');
  expect(charge!.customerId).toBe(customer.id);

  await db.charge.deleteMany({ where: { subscriptionId: subscription.id } });
  await db.subscription.delete({ where: { id: subscription.id } });
  await db.customer.delete({ where: { id: customer.id } });
});

it('desconto PERCENT vigente na emissão reduz o principal líquido', async () => {
  const customer = await db.customer.create({ data: { name: 'Cliente Desconto Teste' } });
  const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const subscription = await createSubscription(customer.id, {
    planId: '', supplierId: '', priceCents: '10000', costCents: '3000', cycle: 'MONTHLY',
    discountType: 'PERCENT', discountValue: '10', discountUntil: farFuture,
    accessUsername: '', accessPassword: '', accessServer: '', screens: 1, accessNotes: '',
  });

  const charge = await db.charge.findFirst({ where: { subscriptionId: subscription.id } });
  expect(charge!.discountCents.toString()).toBe('1000'); // 10% de 10000

  await db.charge.deleteMany({ where: { subscriptionId: subscription.id } });
  await db.subscription.delete({ where: { id: subscription.id } });
  await db.customer.delete({ where: { id: customer.id } });
});
```

(Ajustar imports/setup pro padrão já usado nos outros testes de integração da feature — ler um existente primeiro.)

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `pnpm test:integration -- subscriptions`
Expected: FAIL — nenhuma `Charge` emitida ainda.

- [ ] **Step 4: Implementar**

Modificar `createSubscription` em `src/features/subscriptions/service.ts` — envolver numa transação e emitir a `Charge`:

```ts
export async function createSubscription(customerId: string, input: SubscriptionInput) {
  const settings = await getSettings();
  const startedAt = new Date();
  const nextDueAt = firstDueDate({ startedAt, cycle: input.cycle, timezone: settings.timezone });

  return db.$transaction(async (tx) => {
    const subscription = await tx.subscription.create({
      data: {
        customerId,
        startedAt,
        nextDueAt,
        ...toBaseData(input, settings.timezone),
      },
      omit: { accessPasswordEnc: true },
    });

    if (subscription.status === 'ACTIVE') {
      const principalCents = subscription.priceCents;
      const discountCents = computeChargeDiscount(subscription, startedAt);

      await tx.charge.create({
        data: {
          subscriptionId: subscription.id,
          customerId,
          supplierId: subscription.supplierId,
          principalCents,
          discountCents,
          costCents: subscription.costCents,
          periodStart: localDateOnly(startedAt, settings.timezone),
          periodEnd: localDateOnly(nextDueAt, settings.timezone),
          dueAt: nextDueAt,
        },
      });
    }

    return subscription;
  });
}

/** Desconto vigente na emissão, em centavos. discountUntil precisa cobrir o início do período. */
function computeChargeDiscount(
  subscription: { priceCents: bigint; discountType: string | null; discountValue: unknown; discountUntil: Date | null },
  periodStart: Date,
): bigint {
  if (!subscription.discountType || !subscription.discountValue) return 0n;
  if (subscription.discountUntil && subscription.discountUntil < periodStart) return 0n;

  const value = new Decimal(subscription.discountValue.toString());
  if (subscription.discountType === 'PERCENT') {
    return applyPercent(subscription.priceCents, value);
  }
  // FIXED: discountValue está em reais (Decimal(10,2)), converte pra centavos.
  return BigInt(value.times(100).toFixed(0));
}
```

Adicionar os imports necessários no topo do arquivo: `localDateOnly` de `@/core/dates`, `applyPercent` de `@/core/money`, `Decimal` de `decimal.js`.

⚠️ Conferir que `discountCents` nunca excede `principalCents` (o `CHECK charges_discount_bounded` do banco garante isso — se o cálculo produzir um valor maior, é bug em `computeChargeDiscount`, não silenciar, deixar o `CHECK` estourar em teste).

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `pnpm test:integration -- subscriptions`
Expected: PASS.

- [ ] **Step 6: Rodar toda a suíte de subscriptions pra garantir que nada quebrou**

Run: `pnpm test && pnpm test:integration`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/subscriptions/service.ts src/features/subscriptions/service.integration.test.ts
git commit -m "feat(subscriptions): emit first Charge on active subscription creation"
```

---

### Task 6: `features/charges/` — schema, queries, service (pagamento e cancelamento)

**Files:**
- Create: `src/features/charges/schema.ts`
- Create: `src/features/charges/queries.ts`
- Create: `src/features/charges/service.ts`
- Create: `src/features/charges/service.integration.test.ts`

**Interfaces:**
- Produces:
  - `registerPaymentSchema` (Zod) — `{ amountCents: string; method: PaymentMethod; paidAt: string; note?: string; idempotencyKey: string }`
  - `ChargeDTO`, `PaymentDTO` — tipos de leitura, usados pelas queries e pelos componentes (Task 9, 10, 11)
  - `listCharges(filters): Promise<{ rows: ChargeDTO[]; nextCursor: string | null }>`
  - `getChargesForCustomer(customerId: string): Promise<ChargeDTO[]>`
  - `getDashboardSummary(now: Date): Promise<{ dueToday: ChargeDTO[]; dueNext7Days: ChargeDTO[]; overdue: ChargeDTO[]; receivedThisMonthCents: string }>`
  - `registerPayment(chargeId: string, input: RegisterPaymentInput): Promise<{ chargeId: string; status: ChargeStatus }>` — lança `ChargeNotFoundError`, `PaymentExceedsBalanceError`, `ChargeAlreadyPaidError`
  - `cancelCharge(chargeId: string, reason: string): Promise<void>` — lança `ChargeNotFoundError`, `ChargeHasPaymentError`
- Consumes: `deriveChargeStatus`, `localDateOnly`, `nextDueDate` de `core/` (Tasks 2, 3); `getSettings` de `features/settings/queries.ts`.

- [ ] **Step 1: `src/features/charges/schema.ts`**

```ts
import { z } from 'zod';

export const registerPaymentSchema = z.object({
  amountCents: z.string({ error: 'Valor inválido.' }).regex(/^\d+$/, 'Valor inválido.'),
  method: z.enum(['PIX', 'CASH', 'TRANSFER', 'CARD', 'OTHER'], { error: 'Selecione um método válido.' }),
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data do pagamento inválida.'),
  note: z.string().optional(),
  idempotencyKey: z.string().min(1, 'Identificador de envio ausente.'),
});

export const cancelChargeSchema = z.object({
  reason: z.string().min(1, 'Informe o motivo do cancelamento.'),
});
```

- [ ] **Step 2: `src/features/charges/queries.ts`**

```ts
import { db } from '@/lib/db';
import { monthBoundsUtc } from '@/core/dates';

export interface ChargeDTO {
  id: string;
  customerId: string;
  customerName: string;
  supplierName: string | null;
  principalCents: string;
  discountCents: string;
  netCents: string;
  paidCents: string;
  status: string;
  dueAt: string;
  issuedAt: string;
}

function toChargeDTO(row: {
  id: string; customerId: string; principalCents: bigint; discountCents: bigint;
  status: string; dueAt: Date; issuedAt: Date;
  customer: { name: string }; supplier: { name: string } | null;
  payments: { amountCents: bigint }[];
}): ChargeDTO {
  const netCents = row.principalCents - row.discountCents;
  const paidCents = row.payments.reduce((sum, p) => sum + p.amountCents, 0n);
  return {
    id: row.id,
    customerId: row.customerId,
    customerName: row.customer.name,
    supplierName: row.supplier?.name ?? null,
    principalCents: row.principalCents.toString(),
    discountCents: row.discountCents.toString(),
    netCents: netCents.toString(),
    paidCents: paidCents.toString(),
    status: row.status,
    dueAt: row.dueAt.toISOString(),
    issuedAt: row.issuedAt.toISOString(),
  };
}

const CHARGE_INCLUDE = { customer: { select: { name: true } }, supplier: { select: { name: true } }, payments: { select: { amountCents: true } } } as const;

export async function listCharges(filters: {
  status?: string; customerId?: string; supplierId?: string; cursor?: string; perPage?: number;
}): Promise<{ rows: ChargeDTO[]; nextCursor: string | null }> {
  const perPage = filters.perPage ?? 20;
  const rows = await db.charge.findMany({
    where: {
      status: filters.status ? (filters.status as never) : undefined,
      customerId: filters.customerId || undefined,
      supplierId: filters.supplierId || undefined,
    },
    include: CHARGE_INCLUDE,
    orderBy: [{ dueAt: 'desc' }, { id: 'desc' }],
    take: perPage + 1,
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > perPage;
  const page = hasMore ? rows.slice(0, perPage) : rows;
  return { rows: page.map(toChargeDTO), nextCursor: hasMore ? page[page.length - 1].id : null };
}

export async function getChargesForCustomer(customerId: string): Promise<ChargeDTO[]> {
  const rows = await db.charge.findMany({
    where: { customerId },
    include: CHARGE_INCLUDE,
    orderBy: { dueAt: 'desc' },
  });
  return rows.map(toChargeDTO);
}

export async function getDashboardSummary(now: Date, timezone: string) {
  const todayStart = new Date(now); todayStart.setUTCHours(0, 0, 0, 0);
  const todayEnd = new Date(now); todayEnd.setUTCHours(23, 59, 59, 999);
  const next7End = new Date(todayEnd.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [dueTodayRows, dueNext7Rows, overdueRows, monthPayments] = await Promise.all([
    db.charge.findMany({ where: { dueAt: { gte: todayStart, lte: todayEnd }, status: { in: ['OPEN', 'OVERDUE', 'PARTIALLY_PAID'] } }, include: CHARGE_INCLUDE, orderBy: { dueAt: 'asc' } }),
    db.charge.findMany({ where: { dueAt: { gt: todayEnd, lte: next7End }, status: { in: ['OPEN', 'OVERDUE', 'PARTIALLY_PAID'] } }, include: CHARGE_INCLUDE, orderBy: { dueAt: 'asc' } }),
    db.charge.findMany({ where: { status: 'OVERDUE' }, include: CHARGE_INCLUDE, orderBy: { dueAt: 'asc' } }),
    (() => {
      const { from, to } = monthBoundsUtc(now.getUTCFullYear(), now.getUTCMonth(), timezone);
      return db.payment.aggregate({ where: { paidAt: { gte: from, lt: to } }, _sum: { amountCents: true } });
    })(),
  ]);

  return {
    dueToday: dueTodayRows.map(toChargeDTO),
    dueNext7Days: dueNext7Rows.map(toChargeDTO),
    overdue: overdueRows.map(toChargeDTO),
    receivedThisMonthCents: (monthPayments._sum.amountCents ?? 0n).toString(),
  };
}
```

⚠️ `getDashboardSummary` recebe `now`/`timezone` por parâmetro — quem chama (Server Component da Task 10) resolve `new Date()` uma vez, na borda, não aqui.

- [ ] **Step 3: `src/features/charges/service.ts`**

```ts
import { db } from '@/lib/db';
import { DomainError } from '@/lib/errors';
import { deriveChargeStatus } from '@/core/billing';
import { nextDueDate, localDateOnly } from '@/core/dates';
import { getSettings } from '@/features/settings/queries';
import type { z } from 'zod';
import type { registerPaymentSchema } from './schema';

type RegisterPaymentInput = z.infer<typeof registerPaymentSchema>;

export class ChargeNotFoundError extends DomainError {
  constructor(cause?: unknown) { super('Cobrança não encontrada.', 'CHARGE_NOT_FOUND', { cause }); }
}
export class ChargeAlreadyPaidError extends DomainError {
  constructor(cause?: unknown) { super('Esta cobrança já foi paga.', 'CHARGE_ALREADY_PAID', { cause }); }
}
export class PaymentExceedsBalanceError extends DomainError {
  constructor(cause?: unknown) { super('Valor do pagamento é maior que o saldo devedor.', 'PAYMENT_EXCEEDS_BALANCE', { cause }); }
}
export class ChargeHasPaymentError extends DomainError {
  constructor(cause?: unknown) { super('Cobrança com pagamento registrado não pode ser cancelada.', 'CHARGE_HAS_PAYMENT', { cause }); }
}

function paidAtLocal(dateStr: string, timezone: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return localDateOnly(new Date(Date.UTC(year, month - 1, day)), timezone);
}

export async function registerPayment(chargeId: string, input: RegisterPaymentInput) {
  const settings = await getSettings();
  const amountCents = BigInt(input.amountCents);
  const paidAt = paidAtLocal(input.paidAt, settings.timezone);

  return db.$transaction(async (tx) => {
    const charge = await tx.charge.findUnique({ where: { id: chargeId }, include: { payments: true, subscription: true } });
    if (!charge) throw new ChargeNotFoundError();
    if (charge.status === 'PAID') throw new ChargeAlreadyPaidError();
    if (charge.status === 'CANCELLED') throw new ChargeNotFoundError();

    const netCents = charge.principalCents - charge.discountCents;
    const paidSoFar = charge.payments.reduce((sum, p) => sum + p.amountCents, 0n);
    if (paidSoFar + amountCents > netCents) throw new PaymentExceedsBalanceError();

    try {
      await tx.payment.create({
        data: { chargeId, amountCents, method: input.method, paidAt, note: input.note || null, idempotencyKey: input.idempotencyKey },
      });
    } catch (err) {
      // Segunda tentativa com a mesma idempotencyKey — unique constraint recusa,
      // trata como sucesso silencioso (a primeira já aplicou o pagamento).
      if (isUniqueViolation(err, 'idempotencyKey')) {
        return { chargeId, status: charge.status };
      }
      throw err;
    }

    const newPaidCents = paidSoFar + amountCents;
    const newStatus = deriveChargeStatus({ netCents, paidCents: newPaidCents, dueAt: charge.dueAt, now: new Date() });

    await tx.charge.update({ where: { id: chargeId }, data: { status: newStatus, paidAt: newStatus === 'PAID' ? paidAt : charge.paidAt } });

    if (newStatus === 'PAID') {
      const newNextDueAt = nextDueDate({ paidAt, cycle: charge.subscription.cycle, timezone: settings.timezone });
      await tx.subscription.update({ where: { id: charge.subscriptionId }, data: { nextDueAt: newNextDueAt } });
      await tx.charge.create({
        data: {
          subscriptionId: charge.subscriptionId,
          customerId: charge.customerId,
          supplierId: charge.supplierId,
          principalCents: charge.subscription.priceCents,
          discountCents: 0n,
          costCents: charge.subscription.costCents,
          periodStart: charge.periodEnd,
          periodEnd: localDateOnly(newNextDueAt, settings.timezone),
          dueAt: newNextDueAt,
        },
      });
    }

    return { chargeId, status: newStatus };
  });
}

export async function cancelCharge(chargeId: string, reason: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const charge = await tx.charge.findUnique({ where: { id: chargeId }, include: { payments: true } });
    if (!charge) throw new ChargeNotFoundError();
    if (charge.payments.length > 0) throw new ChargeHasPaymentError();

    await tx.charge.update({ where: { id: chargeId }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason } });
  });
}

function isUniqueViolation(err: unknown, field: string): boolean {
  return !!err && typeof err === 'object' && 'code' in err && err.code === 'P2002' && 'meta' in err &&
    !!err.meta && typeof err.meta === 'object' && 'target' in err.meta &&
    Array.isArray(err.meta.target) && err.meta.target.includes(field);
}
```

⚠️ Renovação sem desconto (`discountCents: 0n` na nova `Charge` emitida por pagamento total) é uma simplificação deliberada desta etapa — reaplicar desconto vigente na renovação exigiria reler `discountUntil` contra o novo `periodStart`, mesma lógica de `computeChargeDiscount` da Task 5. Se o critério de pronto do spec cobrar isso explicitamente, mover essa função pra `core/billing.ts` (hoje só existe dentro de `subscriptions/service.ts`) e reusar aqui — decisão registrada, não esquecida.

- [ ] **Step 4: Testes de integração — `src/features/charges/service.integration.test.ts`**

Cobrir, no mínimo (seguir o padrão AAA e cleanup dos testes de integração já existentes na feature de subscriptions):

```ts
it('pagamento total marca PAID e emite a próxima Charge com vencimento certo', async () => { /* ... */ });
it('pagamento parcial marca PARTIALLY_PAID e não emite próxima Charge', async () => { /* ... */ });
it('duas tentativas com a mesma idempotencyKey não duplicam o Payment', async () => { /* ... */ });
it('pagamento acima do saldo devedor é recusado com PaymentExceedsBalanceError', async () => { /* ... */ });
it('cobrança com pagamento registrado não pode ser cancelada', async () => { /* ... */ });
it('cobrança sem pagamento pode ser cancelada e não conta mais como aberta', async () => { /* ... */ });
```

- [ ] **Step 5: Rodar e ajustar até verde**

```bash
pnpm typecheck
pnpm test:integration -- charges
```

- [ ] **Step 6: Commit**

```bash
git add src/features/charges/schema.ts src/features/charges/queries.ts src/features/charges/service.ts src/features/charges/service.integration.test.ts
git commit -m "feat(charges): add payment registration and cancellation service"
```

---

### Task 7: `features/charges/actions.ts` — Server Actions

**Files:**
- Create: `src/features/charges/actions.ts`
- Modify: `src/lib/messages.ts` (adicionar mensagens de `charges`)

**Interfaces:**
- Consumes: `registerPayment`, `cancelCharge` (Task 6).
- Produces: `registerPaymentAction(chargeId: string, input: unknown): Promise<ActionResult>`, `cancelChargeAction(chargeId: string, input: unknown): Promise<ActionResult>` — usadas pelos componentes das Tasks 9/11.

- [ ] **Step 1: Adicionar mensagens**

Em `src/lib/messages.ts`, adicionar ao objeto `messages`:

```ts
  charges: {
    paymentRegistered: 'Pagamento registrado.',
    cancelled: 'Cobrança cancelada.',
  },
```

- [ ] **Step 2: `src/features/charges/actions.ts`**

Mesmo padrão de `src/features/subscriptions/actions.ts` (ler esse arquivo antes de escrever, seguir exatamente a forma):

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { registerPaymentSchema, cancelChargeSchema } from './schema';
import { registerPayment, cancelCharge } from './service';
import { requireSession } from '@/features/auth/service';
import { DomainError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { messages } from '@/lib/messages';

type ActionResult = { ok: true } | { error: { code: string; message: string } };

export async function registerPaymentAction(chargeId: string, customerId: string, input: unknown): Promise<ActionResult> {
  try {
    await requireSession();
    const parsed = registerPaymentSchema.safeParse(input);
    if (!parsed.success) {
      return { error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? messages.common.invalidInput } };
    }

    await registerPayment(chargeId, parsed.data);
    revalidatePath(`/customers/${customerId}`);
    revalidatePath('/charges');
    revalidatePath('/');
    return { ok: true as const };
  } catch (err) {
    if (err instanceof DomainError) return { error: { code: err.code, message: err.message } };
    logger.error({ route: 'charges.registerPayment', error: String(err), stack: err instanceof Error ? err.stack : undefined });
    return { error: { code: 'UNEXPECTED', message: messages.common.unexpectedError } };
  }
}

export async function cancelChargeAction(chargeId: string, customerId: string, input: unknown): Promise<ActionResult> {
  try {
    await requireSession();
    const parsed = cancelChargeSchema.safeParse(input);
    if (!parsed.success) {
      return { error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? messages.common.invalidInput } };
    }

    await cancelCharge(chargeId, parsed.data.reason);
    revalidatePath(`/customers/${customerId}`);
    revalidatePath('/charges');
    revalidatePath('/');
    return { ok: true as const };
  } catch (err) {
    if (err instanceof DomainError) return { error: { code: err.code, message: err.message } };
    logger.error({ route: 'charges.cancel', error: String(err), stack: err instanceof Error ? err.stack : undefined });
    return { error: { code: 'UNEXPECTED', message: messages.common.unexpectedError } };
  }
}
```

- [ ] **Step 3: Verificar**

```bash
pnpm typecheck && pnpm lint && pnpm build
```

- [ ] **Step 4: Commit**

```bash
git add src/features/charges/actions.ts src/lib/messages.ts
git commit -m "feat(charges): add Server Actions for payment and cancellation"
```

---

### Task 8: Job `charges-mark-overdue`

**Files:**
- Create: `src/app/api/cron/charges-mark-overdue/route.ts`
- Create: `src/app/api/cron/charges-mark-overdue/route.integration.test.ts`

**Interfaces:**
- Consumes: `assertCloudSchedulerToken` (Task 4), `deriveChargeStatus` (Task 3), `db`.

- [ ] **Step 1: Escrever o teste de integração que falha**

```ts
it('rebaixa OPEN vencida para OVERDUE e mantém PARTIALLY_PAID vencida como OVERDUE', async () => {
  // arrange: criar Charge OPEN com dueAt no passado, e outra PARTIALLY_PAID com dueAt no passado
  // act: chamar o handler (ou a função exportada separadamente do route.ts, ver Step 2) com now = hoje
  // assert: ambas viram OVERDUE
});

it('não mexe em Charge ainda não vencida', async () => { /* ... */ });
it('rodar duas vezes seguidas dá o mesmo resultado (idempotente)', async () => { /* ... */ });
it('sem token válido devolve 401', async () => { /* ... */ });
```

- [ ] **Step 2: Implementar**

Extrair a lógica de negócio pra uma função testável separada do handler HTTP (mesmo padrão dos outros jobs — handler é casca fina):

```ts
// src/app/api/cron/charges-mark-overdue/route.ts
import { NextResponse } from 'next/server';
import { assertCloudSchedulerToken } from '@/lib/cron-auth';
import { db } from '@/lib/db';
import { deriveChargeStatus } from '@/core/billing';
import { logger } from '@/lib/logger';

export async function markOverdueCharges(now: Date): Promise<{ checked: number; updated: number; failed: number }> {
  const charges = await db.charge.findMany({
    where: { status: { in: ['OPEN', 'OVERDUE', 'PARTIALLY_PAID'] } },
    include: { payments: { select: { amountCents: true } } },
  });

  let updated = 0;
  let failed = 0;

  for (const charge of charges) {
    try {
      const netCents = charge.principalCents - charge.discountCents;
      const paidCents = charge.payments.reduce((sum, p) => sum + p.amountCents, 0n);
      const newStatus = deriveChargeStatus({ netCents, paidCents, dueAt: charge.dueAt, now });

      if (newStatus !== charge.status) {
        await db.charge.update({ where: { id: charge.id }, data: { status: newStatus } });
        updated++;
      }
    } catch (err) {
      failed++;
      logger.error({ job: 'charges-mark-overdue', chargeId: charge.id, error: String(err) });
    }
  }

  return { checked: charges.length, updated, failed };
}

export async function POST(req: Request) {
  try {
    await assertCloudSchedulerToken(req);
  } catch {
    return new NextResponse(null, { status: 401 });
  }

  const result = await markOverdueCharges(new Date());
  logger.info({ job: 'charges-mark-overdue', ...result });
  return NextResponse.json(result);
}
```

- [ ] **Step 3: Rodar e ajustar até verde**

```bash
pnpm test:integration -- charges-mark-overdue
```

- [ ] **Step 4: Verificar**

```bash
pnpm typecheck && pnpm lint && pnpm build
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cron/charges-mark-overdue
git commit -m "feat(cron): add charges-mark-overdue job"
```

---

### Task 9: Lista de cobranças — `/charges`

**Files:**
- Create: `src/app/(app)/charges/page.tsx`
- Create: `src/features/charges/components/charge-table.tsx`
- Create: `src/features/charges/components/charge-status-badge.tsx`
- Create: `src/features/charges/components/charge-filters.tsx`
- Modify: `src/components/layout/sidebar.tsx` (corrigir `/cobrancas` → `/charges`)

**Interfaces:**
- Consumes: `listCharges` (Task 6).

- [ ] **Step 1: Corrigir a rota no sidebar**

Em `src/components/layout/sidebar.tsx`, mudar `{ href: '/cobrancas', label: 'Cobranças', icon: Receipt }` para `{ href: '/charges', label: 'Cobranças', icon: Receipt }`.

- [ ] **Step 2: `charge-status-badge.tsx`**

Componente pequeno, cor por status (`OPEN` neutro, `OVERDUE` `bg-danger`, `PARTIALLY_PAID` `bg-warning` ou equivalente do design tokens já em uso — conferir `globals.css` pelos tokens exatos antes de inventar classe nova, seguir o mesmo padrão de badge já usado em `SubscriptionStatus` se existir um componente parecido em `features/subscriptions/components/`).

- [ ] **Step 3: `charge-filters.tsx`**

Client component, filtros em `searchParams` (não `useState`) — status (select), cliente (busca por nome ou id, mesmo padrão de busca já usado em `/customers`), fornecedor (select), sem filtro de período nesta primeira versão (spec deixou fora do filtro por ora, só `dueAt` ordena).

- [ ] **Step 4: `charge-table.tsx`**

Tabela com paginação por cursor (botão "Carregar mais" ou padrão já usado em `customer-table.tsx` — ler esse componente primeiro e seguir a mesma forma de paginação).

- [ ] **Step 5: `(app)/charges/page.tsx`**

Server Component — resolve `searchParams`, chama `listCharges`, monta `AppShell` + filtros + tabela. Zero Prisma, zero cálculo.

- [ ] **Step 6: Verificar**

```bash
pnpm typecheck && pnpm lint && pnpm build
```

- [ ] **Step 7: Commit**

```bash
git add src/app/\(app\)/charges src/features/charges/components src/components/layout/sidebar.tsx
git commit -m "feat(charges): add charges list page with status/customer/supplier filters"
```

---

### Task 10: Painel de vencimentos — dashboard `/`

**Files:**
- Create: `src/app/(app)/page.tsx`
- Create: `src/features/charges/components/dashboard-panel.tsx`

**Interfaces:**
- Consumes: `getDashboardSummary` (Task 6), `getSettings` (já existe).

- [ ] **Step 1: `(app)/page.tsx`**

Server Component — `now = new Date()` resolvido aqui (única vez, na borda), chama `getSettings()` e `getDashboardSummary(now, settings.timezone)`, passa pro componente.

- [ ] **Step 2: `dashboard-panel.tsx`**

Quatro blocos (vencem hoje, próximos 7 dias, em atraso, recebido no mês) — cada um linka pra `/charges?status=...` filtrado. Usa `formatCents`/`formatLocalDate` (já existem em `lib/format.ts`), nunca formata dinheiro/data à mão.

- [ ] **Step 3: Verificar**

```bash
pnpm typecheck && pnpm lint && pnpm build
```

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/page.tsx" src/features/charges/components/dashboard-panel.tsx
git commit -m "feat(charges): add dashboard with due-date panel"
```

---

### Task 11: Aba "Cobranças" na ficha do cliente + diálogos de pagamento/cancelamento

**Files:**
- Modify: `src/features/customers/components/customer-tabs.tsx` (habilitar a aba)
- Modify: `src/app/(app)/customers/[id]/page.tsx`
- Create: `src/features/charges/components/customer-charge-list.tsx`
- Create: `src/features/charges/components/register-payment-dialog.tsx`
- Create: `src/features/charges/components/cancel-charge-dialog.tsx`

**Interfaces:**
- Consumes: `getChargesForCustomer` (Task 6), `registerPaymentAction`, `cancelChargeAction` (Task 7).

- [ ] **Step 1: Habilitar a aba**

Em `customer-tabs.tsx`, mudar a entrada `{ key: 'charges', label: 'Cobranças', disabled: true, title: 'Disponível na Etapa 2' }` para `disabled: false` (remover `title`).

- [ ] **Step 2: `register-payment-dialog.tsx`**

Client component, mesmo padrão de `SubscriptionDrawer` (`react-hook-form` + `zodResolver(registerPaymentSchema)`). Gera `idempotencyKey` com `crypto.randomUUID()` **na abertura do diálogo** (não a cada render — `useState(() => crypto.randomUUID())` ou equivalente), reseta ao fechar/reabrir. Botão desabilita durante o submit (`isSubmitting`).

- [ ] **Step 3: `cancel-charge-dialog.tsx`**

Usa `ConfirmDialog` (já existe em `components/ui/`) + campo de motivo — ação destrutiva, confirmação explícita. Só renderiza o botão de cancelar se a `Charge` não tiver `paidCents > '0'` (checagem de UI espelhando a checagem do service, não substituindo).

- [ ] **Step 4: `customer-charge-list.tsx`**

Lista as `Charge`s do cliente (todas as assinaturas), cada uma com seus `Payment`s, botões de registrar pagamento / cancelar quando aplicável.

- [ ] **Step 5: Atualizar `(app)/customers/[id]/page.tsx`**

Ler o arquivo atual, ramificar por `aba` (hoje sempre `'subscriptions'`, o comentário já avisa que isso muda quando Cobranças ganhar conteúdo real): resolver `aba` de `searchParams` de verdade, buscar `getChargesForCustomer(id)` quando `aba === 'charges'`, renderizar `CustomerChargeList` dentro do `CustomerTabs`.

- [ ] **Step 6: Verificar**

```bash
pnpm typecheck && pnpm lint && pnpm build
```

- [ ] **Step 7: Commit**

```bash
git add src/features/customers/components/customer-tabs.tsx "src/app/(app)/customers/[id]/page.tsx" src/features/charges/components
git commit -m "feat(charges): enable charges tab on customer profile with payment/cancel dialogs"
```

---

### Task 12: Verificação final

**Files:** nenhum criado — só checagem.

- [ ] **Step 1: Gate completo**

```bash
docker compose up -d db
pnpm test
pnpm test:integration
pnpm typecheck && pnpm lint && pnpm build
```

- [ ] **Step 2: Cenário ponta a ponta manual (dev server)**

```bash
pnpm dev &
sleep 3
```

Login, criar uma assinatura `ACTIVE` nova pra um cliente de teste, confirmar que uma `Charge` `OPEN` aparece na aba Cobranças da ficha e no painel do dashboard. Registrar um pagamento parcial, confirmar que o status vira `PARTIALLY_PAID` e nenhuma nova `Charge` nasce. Registrar o restante, confirmar que vira `PAID` e uma nova `Charge` `OPEN` nasce com o vencimento certo (mês seguinte, mesmo dia do pagamento). Tentar cancelar a `Charge` já paga — confirmar que a UI nem oferece o botão. Criar outra assinatura, não pagar, chamar o job manualmente (`curl` com o `CRON_SECRET` dev) com uma `Charge` de vencimento forçado no passado (ajustar direto no banco pra teste) e confirmar que vira `OVERDUE`.

```bash
kill %1
```

- [ ] **Step 3: Atualizar `docs/projeto/tecnico/07-plano-de-entrega.md`**

Marcar os itens da Etapa 2 como `[x]`.

```bash
git add docs/projeto/tecnico/07-plano-de-entrega.md
git commit -m "docs: check off Etapa 2 items"
```

---

## Self-review notes

- **Spec coverage:** emissão automática (Tasks 5, 6), registro de pagamento total/parcial sem duplicar (Task 6, idempotencyKey), cancelamento bloqueado por pagamento (Task 6), job de atraso (Task 8), OIDC do Cloud Scheduler (Task 4 — exigência do próprio `05-credenciais-e-seguranca.md`, não estava no spec explicitamente mas é parte do critério "Cloud Scheduler configurado com autenticação OIDC" do `07-plano-de-entrega.md`), painel de vencimentos (Task 10), lista de cobranças (Task 9), histórico na ficha (Task 11). Todas as seções do spec têm task.
- **Placeholder scan:** nenhum "TBD"/"implementar depois" solto. A simplificação documentada (desconto não reaplicado na renovação automática) está marcada explicitamente como decisão, com o caminho de correção anotado, não escondida.
- **Consistência de tipo:** `deriveChargeStatus` (Task 3) usado com a mesma assinatura em Task 6 (`registerPayment`) e Task 8 (`markOverdueCharges`) — conferido campo a campo. `ChargeDTO`/`PaymentDTO` definidos uma vez em `queries.ts` (Task 6), reusados por todos os componentes das Tasks 9–11 sem redefinição paralela.
- **Arquitetura:** nenhuma feature importa de outra — `subscriptions/service.ts` (Task 5) e `charges/service.ts` (Task 6) tocam a tabela `charges`/`subscriptions` direto via `tx`, nunca importando o `service.ts` um do outro. Confirmado contra a matriz de import de `01-arquitetura.md`.
