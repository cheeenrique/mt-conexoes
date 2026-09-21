# Histórico financeiro (fatia 1) — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Toda mutação financeira passa a deixar rastro, e a ficha do cliente ganha uma linha do tempo que responde "por que este cliente mudou de preço".

**Architecture:** Uma tabela `financial_events` por cliente, escrita por `lib/financial-events.ts` **dentro da transação que já existe** em cada service. O que vira evento é decidido por função pura em `core/` — um evento por decisão do operador, não por coluna alterada. Nada lê o log para calcular dinheiro.

**Tech Stack:** Next.js App Router, Prisma + Postgres, Vitest (unit + integração contra Postgres real), Tailwind.

**Spec:** [`docs/superpowers/specs/2026-09-20-historico-e-edicoes-financeiras-design.md`](../specs/2026-09-20-historico-e-edicoes-financeiras-design.md)

## Global Constraints

- Dinheiro é `BigInt` em centavos, sufixo `...Cents`. **Nunca `float`, nem em variável temporária.** No payload do log, centavos vão como **string**.
- **O log é registro, nunca fonte de saldo.** Todo total continua saindo de `SUM` sobre `payments`/`charges`. Nenhuma query de relatório pode ler `financial_events`.
- `core/` é puro: não importa Prisma, Next, `process.env`, `node:crypto`, e **não chama `new Date()`** — o instante entra por parâmetro.
- Uma feature não importa de outra feature. Quem cruza features é `app/`.
- Evento e mutação vão **no mesmo commit de transação**. Rollback não pode deixar nenhum dos dois órfão.
- Migration aplicada é imutável — corrigir é migration nova. Migrations deste repo são numeradas à mão em sequência (`00000000000021_...`), não pelo timestamp do Prisma.
- Sem `console.log`. Log técnico é JSON com ids.
- Texto visível ao operador em **pt-BR**; código, identificadores e commits em inglês.
- Commits em Conventional Commits, corpo explicando **por quê**.

## Desvio consciente do spec

O spec desenha `FinancialEvent` com FK para `customers` e `users`. **O plano não usa FK nenhuma**, seguindo `CredentialReveal` (`prisma/schema.prisma`), que é a tabela de auditoria que já existe aqui e guarda `subscriptionId`/`userId` como string solta, sem relação. Razões: consistência com o precedente, nenhuma back-relation nova em `User`/`Customer`, e a mesma imunidade que o spec já exigia para `entityId` (o pagamento é apagado; o evento fica).

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `prisma/schema.prisma` | enums + model `FinancialEvent` |
| `prisma/migrations/00000000000021_financial_events/migration.sql` | tabela + índice |
| `src/core/subscription-events.ts` | puro: dado antes/depois da assinatura, quais eventos nascem |
| `src/core/subscription-events.test.ts` | unit |
| `src/lib/financial-events.ts` | escreve e lê a linha; sem regra de quando |
| `src/lib/financial-events.integration.test.ts` | integração |
| `src/features/charges/service.ts` | grava nos quatro pontos de cobrança |
| `src/features/subscriptions/service.ts` | grava nos dois pontos de assinatura |
| `src/features/customers/ficha-types.ts` | `FichaEventDTO` |
| `src/app/(app)/customers/ficha-action.ts` | carrega os eventos na ficha |
| `src/features/customers/components/ficha/ficha-events.tsx` | a seção "Alterações" |
| `src/features/customers/components/ficha/ficha-events.test.tsx` | unit |
| `src/lib/labels.ts` | rótulo pt-BR de cada `kind` |
| `src/app/(app)/customers/customer-anonymization.ts` | limpa `reason` |

---

### Task 1: Tabela e escritor do log

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/00000000000021_financial_events/migration.sql`
- Create: `src/lib/financial-events.ts`
- Test: `src/lib/financial-events.integration.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `recordFinancialEvent(tx: Prisma.TransactionClient, params: RecordFinancialEventParams): Promise<void>`
  - `listFinancialEvents(customerId: string): Promise<FinancialEventRow[]>`
  - `type RecordFinancialEventParams = { customerId: string; entityType: FinancialEventEntity; entityId: string; kind: FinancialEventKind; before?: Record<string, string | null>; after?: Record<string, string | null>; reason?: string | null; userId?: string | null }`
  - `type FinancialEventRow = { id: string; entityType: string; entityId: string; kind: string; before: Record<string, string | null> | null; after: Record<string, string | null> | null; reason: string | null; at: Date }`

- [ ] **Step 1: Declarar o modelo no schema**

Em `prisma/schema.prisma`, ao lado dos outros enums:

```prisma
enum FinancialEventEntity {
  SUBSCRIPTION
  CHARGE
  PAYMENT
}

enum FinancialEventKind {
  SUBSCRIPTION_PLAN_CHANGED
  SUBSCRIPTION_PRICE_EDITED
  SUBSCRIPTION_CYCLE_CHANGED
  SUBSCRIPTION_DUE_DATE_EDITED
  SUBSCRIPTION_STATUS_CHANGED
  CHARGE_AMOUNT_EDITED
  CHARGE_REALIGNED
  CHARGE_CANCELLED
  CHARGE_WRITTEN_OFF
  PAYMENT_REGISTERED
  PAYMENT_REMOVED
}
```

E o modelo, junto de `CredentialReveal`:

```prisma
/// Rastro de toda mutação financeira, por cliente. Segue CredentialReveal:
/// nenhuma FK, ids como string solta. Não é enfeite de consistência — o
/// pagamento removido é APAGADO de `payments`, e uma FK ou faria a remoção
/// falhar (restrict) ou levaria junto o evento (cascade), que é o único lugar
/// onde aquele pagamento continua existindo. Não "consertar" isto depois.
model FinancialEvent {
  id         String               @id @default(uuid(7))
  customerId String
  entityType FinancialEventEntity
  entityId   String
  kind       FinancialEventKind
  /// Centavos como string. ⚠️ Nada lê este payload para calcular dinheiro —
  /// é registro, não saldo. Total sai sempre de SUM sobre payments/charges.
  before     Json?
  after      Json?
  /// Texto livre do operador. ⚠️ Pode conter nome de pessoa — a anonimização
  /// (LGPD) limpa este campo e preserva os valores.
  reason     String?
  userId     String?
  at         DateTime             @default(now())

  @@index([customerId, at])
  @@map("financial_events")
}
```

- [ ] **Step 2: Escrever a migration à mão**

Criar o diretório `prisma/migrations/00000000000021_financial_events/` e dentro dele `migration.sql`:

```sql
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
```

- [ ] **Step 3: Aplicar nos dois bancos e gerar o client**

```bash
pnpm db:migrate
pnpm db:migrate:test
pnpm exec prisma generate
```

Esperado: `pnpm db:migrate` imprime `1 migration found` e aplica `00000000000021_financial_events`. Se reclamar de drift, **não** rodar `migrate reset` — conferir se o SQL bate com o `schema.prisma` do Step 1.

- [ ] **Step 4: Escrever o teste que falha**

`src/lib/financial-events.integration.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { recordFinancialEvent, listFinancialEvents } from './financial-events';

const CUSTOMER_NAME = 'Cliente Log Financeiro';

let customerId: string;

beforeEach(async () => {
  const customer = await db.customer.create({ data: { name: CUSTOMER_NAME } });
  customerId = customer.id;
});

afterEach(async () => {
  await db.financialEvent.deleteMany({ where: { customerId } });
  await db.customer.deleteMany({ where: { id: customerId } });
});

describe('recordFinancialEvent', () => {
  it('grava o evento com o payload que recebeu', async () => {
    await db.$transaction((tx) =>
      recordFinancialEvent(tx, {
        customerId,
        entityType: 'SUBSCRIPTION',
        entityId: 'assinatura-1',
        kind: 'SUBSCRIPTION_PRICE_EDITED',
        before: { priceCents: '9000', costCents: '3000' },
        after: { priceCents: '3500', costCents: '1000' },
        reason: 'cliente renegociou',
      }),
    );

    const events = await listFinancialEvents(customerId);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('SUBSCRIPTION_PRICE_EDITED');
    expect(events[0].before).toEqual({ priceCents: '9000', costCents: '3000' });
    expect(events[0].after).toEqual({ priceCents: '3500', costCents: '1000' });
    expect(events[0].reason).toBe('cliente renegociou');
  });

  // O evento é o único lugar onde o pagamento removido continua existindo.
  // Se ele puder sobreviver a um rollback da mutação, o log passa a afirmar
  // coisas que não aconteceram.
  it('rollback da transação não deixa evento órfão', async () => {
    await expect(
      db.$transaction(async (tx) => {
        await recordFinancialEvent(tx, {
          customerId,
          entityType: 'CHARGE',
          entityId: 'cobranca-1',
          kind: 'CHARGE_CANCELLED',
        });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(await listFinancialEvents(customerId)).toHaveLength(0);
  });

  it('devolve do mais recente para o mais antigo', async () => {
    await db.$transaction(async (tx) => {
      await recordFinancialEvent(tx, { customerId, entityType: 'CHARGE', entityId: 'c1', kind: 'CHARGE_CANCELLED' });
      await recordFinancialEvent(tx, { customerId, entityType: 'CHARGE', entityId: 'c2', kind: 'CHARGE_REALIGNED' });
    });

    const events = await listFinancialEvents(customerId);
    expect(events.map((event) => event.kind)).toEqual(['CHARGE_REALIGNED', 'CHARGE_CANCELLED']);
  });
});
```

- [ ] **Step 5: Rodar e ver falhar**

```bash
pnpm test:integration src/lib/financial-events.integration.test.ts
```

Esperado: FAIL no import — `Failed to resolve import "./financial-events"`.

- [ ] **Step 6: Implementar o mínimo**

`src/lib/financial-events.ts`:

```ts
import type { FinancialEventEntity, FinancialEventKind, Prisma } from '@prisma/client';
import { db } from '@/lib/db';

/**
 * Rastro de mutação financeira. Infra, não regra: sabe escrever e ler a linha,
 * e nada sobre **quando** registrar — essa decisão fica no service, que é quem
 * conhece o domínio.
 *
 * Mora em `lib/` porque três features escrevem nele e feature não importa de
 * feature (`.claude/rules/01-arquitetura.md` §Matriz de import).
 *
 * ⚠️ Recebe o cliente de transação, nunca abre o seu: o evento vai no mesmo
 * commit da mutação que ele descreve. Fora disso, um rollback deixa o log
 * afirmando o que não aconteceu — e no caso da remoção de pagamento o log é o
 * único lugar onde aquele registro continua existindo.
 *
 * ⚠️ Centavos entram como string. Este payload é registro, jamais fonte de
 * saldo: todo total sai de `SUM` sobre `payments`/`charges`.
 */
export type FinancialEventPayload = Record<string, string | null>;

export interface RecordFinancialEventParams {
  customerId: string;
  entityType: FinancialEventEntity;
  entityId: string;
  kind: FinancialEventKind;
  before?: FinancialEventPayload;
  after?: FinancialEventPayload;
  /** Texto do operador. ⚠️ Pode conter nome de pessoa — a anonimização limpa. */
  reason?: string | null;
  userId?: string | null;
}

export interface FinancialEventRow {
  id: string;
  entityType: string;
  entityId: string;
  kind: string;
  before: FinancialEventPayload | null;
  after: FinancialEventPayload | null;
  reason: string | null;
  at: Date;
}

export async function recordFinancialEvent(
  tx: Prisma.TransactionClient,
  params: RecordFinancialEventParams,
): Promise<void> {
  await tx.financialEvent.create({
    data: {
      customerId: params.customerId,
      entityType: params.entityType,
      entityId: params.entityId,
      kind: params.kind,
      before: params.before ?? undefined,
      after: params.after ?? undefined,
      reason: params.reason || null,
      userId: params.userId || null,
    },
  });
}

/** Mais recente primeiro — é a ordem em que a ficha lê. */
export async function listFinancialEvents(customerId: string): Promise<FinancialEventRow[]> {
  const rows = await db.financialEvent.findMany({
    where: { customerId },
    orderBy: [{ at: 'desc' }, { id: 'desc' }],
  });

  return rows.map((row) => ({
    id: row.id,
    entityType: row.entityType,
    entityId: row.entityId,
    kind: row.kind,
    before: (row.before as FinancialEventPayload | null) ?? null,
    after: (row.after as FinancialEventPayload | null) ?? null,
    reason: row.reason,
    at: row.at,
  }));
}
```

- [ ] **Step 7: Rodar e ver passar**

```bash
pnpm test:integration src/lib/financial-events.integration.test.ts
```

Esperado: PASS, 3 testes. Se o terceiro falhar por empate de `at` (duas escritas no mesmo milissegundo), o desempate por `id` resolve — `uuid(7)` é ordenável por tempo. Confirmar que o `orderBy` tem os dois campos.

- [ ] **Step 8: Trancar a regra "o log não é fonte de saldo"**

O spec exige que nenhuma query de relatório leia `financial_events`. É uma regra
que se perde em seis meses se ninguém a escrever — um teste barato segura.

`src/lib/financial-events.test.ts`:

```ts
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// O log é registro, nunca fonte de saldo: todo total sai de SUM sobre
// payments/charges. Somar por `financial_events` daria um número que parece
// certo e mente na primeira mutação que falhou no meio.
describe('financial_events fora do relatório', () => {
  it('nenhum SQL de relatório lê a tabela', () => {
    const dir = join(process.cwd(), 'src/features/reports/sql');
    const offenders = readdirSync(dir)
      .filter((file) => file.endsWith('.sql'))
      .filter((file) => readFileSync(join(dir, file), 'utf8').includes('financial_events'));

    expect(offenders).toEqual([]);
  });
});
```

Rodar: `pnpm test src/lib/financial-events.test.ts` — esperado PASS desde já. É
guarda, não TDD: o teste nasce verde e o valor dele é falhar no dia em que
alguém for tentado.

- [ ] **Step 9: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/00000000000021_financial_events src/lib/financial-events.ts src/lib/financial-events.integration.test.ts src/lib/financial-events.test.ts
git commit -m "feat(lib): tabela e escritor do histórico financeiro

Nenhuma mutação de dinheiro deixa rastro hoje — 'por que este cliente mudou
de preço' não tem resposta no sistema. A tabela é o que torna aceitável
afrouxar a imutabilidade do documento financeiro na fatia seguinte.

Sem FK de propósito, seguindo credential_reveals: o pagamento removido é
apagado de payments, e uma FK faria a remoção falhar ou levaria junto o
evento, que é o único lugar onde aquele pagamento continua existindo."
```

---

### Task 2: Cobrança grava os quatro eventos

**Files:**
- Modify: `src/features/charges/service.ts`
- Test: `src/features/charges/service.integration.test.ts`

**Interfaces:**
- Consumes: `recordFinancialEvent` da Task 1.
- Produces: nada novo — muda comportamento de `registerPayment`, `cancelCharge`, `writeOffRemaining`, `realignChargeToSubscription`.

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao fim de `src/features/charges/service.integration.test.ts`. As fixtures `customerId`, `subscriptionId`, `chargeId` e `paymentInput` já existem no arquivo (topo). Acrescentar a limpeza de eventos ao `afterEach` que já está lá:

```ts
// no afterEach existente, ANTES do delete de charges:
await db.financialEvent.deleteMany({ where: { customerId } });
```

E o bloco novo:

```ts
describe('histórico financeiro das cobranças', () => {
  it('registrar pagamento grava PAYMENT_REGISTERED com o valor', async () => {
    await registerPayment(chargeId, paymentInput({ amountCents: '3000' }));

    const events = await db.financialEvent.findMany({ where: { customerId } });
    const registered = events.find((event) => event.kind === 'PAYMENT_REGISTERED');
    expect(registered).toBeTruthy();
    expect(registered?.entityType).toBe('PAYMENT');
    expect((registered?.after as Record<string, string>).amountCents).toBe('3000');
  });

  it('cancelar grava CHARGE_CANCELLED com o motivo digitado', async () => {
    await cancelCharge(chargeId, 'cliente desistiu');

    const event = await db.financialEvent.findFirstOrThrow({ where: { customerId, kind: 'CHARGE_CANCELLED' } });
    expect(event.entityType).toBe('CHARGE');
    expect(event.entityId).toBe(chargeId);
    expect(event.reason).toBe('cliente desistiu');
  });

  it('baixa do restante grava CHARGE_WRITTEN_OFF com o desconto aplicado', async () => {
    await registerPayment(chargeId, paymentInput({ amountCents: '3000' }));
    await writeOffRemaining(chargeId);

    const event = await db.financialEvent.findFirstOrThrow({ where: { customerId, kind: 'CHARGE_WRITTEN_OFF' } });
    expect((event.before as Record<string, string>).discountCents).toBe('0');
    expect((event.after as Record<string, string>).discountCents).toBe('7000');
  });

  it('realinhar grava CHARGE_REALIGNED com o antes e o depois do valor', async () => {
    await db.subscription.update({ where: { id: subscriptionId }, data: { priceCents: 3000n, costCents: 900n } });

    await realignChargeToSubscription(chargeId);

    const event = await db.financialEvent.findFirstOrThrow({ where: { customerId, kind: 'CHARGE_REALIGNED' } });
    expect((event.before as Record<string, string>).principalCents).toBe('10000');
    expect((event.after as Record<string, string>).principalCents).toBe('3000');
  });

  // O log é registro, não saldo — e essa separação só vale se ninguém for
  // tentado a somar por ele.
  it('não grava evento quando a mutação é recusada', async () => {
    await cancelCharge(chargeId, 'cliente desistiu');
    await expect(realignChargeToSubscription(chargeId)).rejects.toThrow(ChargeNotFoundError);

    const realigned = await db.financialEvent.findMany({ where: { customerId, kind: 'CHARGE_REALIGNED' } });
    expect(realigned).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
pnpm test:integration src/features/charges/service.integration.test.ts
```

Esperado: FAIL nos cinco primeiros asserts de evento — `expect(received).toBeTruthy()` recebendo `undefined`, e `findFirstOrThrow` lançando `NotFoundError`. O teste "não grava evento quando a mutação é recusada" passa desde já (guarda).

- [ ] **Step 3: Implementar**

Em `src/features/charges/service.ts`, importar no topo:

```ts
import { recordFinancialEvent } from '@/lib/financial-events';
```

Em `registerPayment`, dentro da transação, **depois** do `tx.charge.update` de status e **antes** do `if (newStatus === 'PAID')`:

```ts
    await recordFinancialEvent(tx, {
      customerId: charge.customerId,
      entityType: 'PAYMENT',
      entityId: chargeId,
      kind: 'PAYMENT_REGISTERED',
      after: {
        amountCents: amountCents.toString(),
        method: input.method,
        paidAt: paidAt.toISOString(),
        chargeStatus: newStatus,
      },
      reason: input.note || null,
    });
```

Em `cancelCharge`, no mesmo commit do `tx.charge.update`:

```ts
    await recordFinancialEvent(tx, {
      customerId: charge.customerId,
      entityType: 'CHARGE',
      entityId: chargeId,
      kind: 'CHARGE_CANCELLED',
      before: { status: charge.status },
      after: { status: 'CANCELLED' },
      reason,
    });
```

Em `writeOffRemaining`, depois do `tx.charge.update` e antes do `openNextCycle`:

```ts
    await recordFinancialEvent(tx, {
      customerId: charge.customerId,
      entityType: 'CHARGE',
      entityId: chargeId,
      kind: 'CHARGE_WRITTEN_OFF',
      before: { status: charge.status, discountCents: charge.discountCents.toString() },
      after: { status: 'PAID', discountCents: (charge.principalCents - paidCents).toString() },
    });
```

Em `realignChargeToSubscription`, depois do `tx.charge.update` e antes do `tx.message.updateMany`:

```ts
    await recordFinancialEvent(tx, {
      customerId: charge.customerId,
      entityType: 'CHARGE',
      entityId: chargeId,
      kind: 'CHARGE_REALIGNED',
      before: {
        principalCents: charge.principalCents.toString(),
        costCents: charge.costCents.toString(),
        discountCents: charge.discountCents.toString(),
      },
      after: {
        principalCents: charge.subscription.priceCents.toString(),
        costCents: charge.subscription.costCents.toString(),
        discountCents: discountCents.toString(),
      },
    });
```

Os quatro services já têm `charge.customerId` em mãos: todos leem por `findUnique` com `include`, que devolve os escalares da linha inteira. **Não** abrir uma segunda query para buscar o cliente.

- [ ] **Step 4: Rodar e ver passar**

```bash
pnpm test:integration src/features/charges/service.integration.test.ts
```

Esperado: PASS, todos. Se algum evento vier com `customerId` vazio, é o ⚠️ do Step 3.

- [ ] **Step 5: Commit**

```bash
git add src/features/charges/service.ts src/features/charges/service.integration.test.ts
git commit -m "feat(charges): cobrança registra o que mudou no histórico financeiro

Pagamento, cancelamento, baixa do restante e realinhamento passam a gravar
antes/depois no mesmo commit da mutação. Fora da transação, um rollback
deixaria o log afirmando o que não aconteceu."
```

---

### Task 3: Assinatura grava um evento por decisão

**Files:**
- Create: `src/core/subscription-events.ts`
- Test: `src/core/subscription-events.test.ts`
- Modify: `src/features/subscriptions/service.ts`
- Test: `src/features/subscriptions/service.integration.test.ts`

**Interfaces:**
- Consumes: `recordFinancialEvent` da Task 1.
- Produces:
  - `type SubscriptionEventKind = 'SUBSCRIPTION_PLAN_CHANGED' | 'SUBSCRIPTION_PRICE_EDITED' | 'SUBSCRIPTION_CYCLE_CHANGED' | 'SUBSCRIPTION_DUE_DATE_EDITED' | 'SUBSCRIPTION_STATUS_CHANGED'`
  - `type SubscriptionSnapshot = { planId: string | null; priceCents: string; costCents: string; cycle: string; nextDueAt: string; status: string }`
  - `diffSubscriptionForEvents(before: SubscriptionSnapshot, after: SubscriptionSnapshot): { kind: SubscriptionEventKind; before: Record<string, string | null>; after: Record<string, string | null> }[]`

- [ ] **Step 1: Escrever o teste puro que falha**

`src/core/subscription-events.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { diffSubscriptionForEvents, type SubscriptionSnapshot } from './subscription-events';

const BASE: SubscriptionSnapshot = {
  planId: 'plano-trimestral',
  priceCents: '9000',
  costCents: '3000',
  cycle: 'QUARTERLY',
  nextDueAt: '2026-09-25',
  status: 'ACTIVE',
};

function withChanges(changes: Partial<SubscriptionSnapshot>): SubscriptionSnapshot {
  return { ...BASE, ...changes };
}

describe('diffSubscriptionForEvents', () => {
  it('salvar sem mexer em nada não gera evento', () => {
    expect(diffSubscriptionForEvents(BASE, BASE)).toEqual([]);
  });

  // Um clique do operador é uma linha na ficha. Trocar o plano mexe em quatro
  // colunas de uma vez; quatro eventos transformariam a linha do tempo em log
  // de banco, e o operador para de ler.
  it('troca de plano é UM evento, mesmo mexendo em preço, custo e ciclo juntos', () => {
    const events = diffSubscriptionForEvents(
      BASE,
      withChanges({ planId: 'plano-mensal', priceCents: '3500', costCents: '1000', cycle: 'MONTHLY' }),
    );

    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('SUBSCRIPTION_PLAN_CHANGED');
    expect(events[0].before).toEqual({
      planId: 'plano-trimestral', priceCents: '9000', costCents: '3000', cycle: 'QUARTERLY',
    });
    expect(events[0].after).toEqual({
      planId: 'plano-mensal', priceCents: '3500', costCents: '1000', cycle: 'MONTHLY',
    });
  });

  it('preço e custo editados à mão, sem trocar de plano, viram um evento só', () => {
    const events = diffSubscriptionForEvents(BASE, withChanges({ priceCents: '9500', costCents: '3200' }));

    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('SUBSCRIPTION_PRICE_EDITED');
    expect(events[0].after).toEqual({ priceCents: '9500', costCents: '3200' });
  });

  it('ciclo, vencimento e situação são decisões separadas', () => {
    const events = diffSubscriptionForEvents(
      BASE,
      withChanges({ cycle: 'MONTHLY', nextDueAt: '2026-10-05', status: 'SUSPENDED' }),
    );

    expect(events.map((event) => event.kind)).toEqual([
      'SUBSCRIPTION_CYCLE_CHANGED',
      'SUBSCRIPTION_DUE_DATE_EDITED',
      'SUBSCRIPTION_STATUS_CHANGED',
    ]);
  });

  it('plano removido ("Nenhum") também é troca de plano', () => {
    const events = diffSubscriptionForEvents(BASE, withChanges({ planId: null }));

    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('SUBSCRIPTION_PLAN_CHANGED');
    expect(events[0].after.planId).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
pnpm test src/core/subscription-events.test.ts
```

Esperado: FAIL no import — `Failed to resolve import "./subscription-events"`.

- [ ] **Step 3: Implementar a função pura**

`src/core/subscription-events.ts`:

```ts
/**
 * Quais eventos nascem de uma edição de assinatura.
 *
 * **Um evento por decisão do operador, não por coluna alterada.** Trocar o
 * plano mexe em plano, preço, custo e ciclo de uma vez — quatro eventos para
 * um clique transformam a linha do tempo da ficha em log de banco, e o jeito
 * mais rápido de fazer o operador parar de ler o histórico é enchê-lo de
 * ruído. Só vira evento próprio o que ele mexeu sozinho.
 *
 * Puro de propósito (`.claude/rules/01-arquitetura.md`): recebe os dois
 * retratos já achatados em string, não conhece Prisma, e por isso o `kind` é
 * união de string em vez do enum gerado. Um teste de integração garante que
 * toda união daqui existe no enum do banco.
 */
export type SubscriptionEventKind =
  | 'SUBSCRIPTION_PLAN_CHANGED'
  | 'SUBSCRIPTION_PRICE_EDITED'
  | 'SUBSCRIPTION_CYCLE_CHANGED'
  | 'SUBSCRIPTION_DUE_DATE_EDITED'
  | 'SUBSCRIPTION_STATUS_CHANGED';

export interface SubscriptionSnapshot {
  planId: string | null;
  /** Centavos como string — este módulo não calcula, só compara. */
  priceCents: string;
  costCents: string;
  cycle: string;
  /** 'YYYY-MM-DD' no fuso do negócio. */
  nextDueAt: string;
  status: string;
}

export interface SubscriptionEvent {
  kind: SubscriptionEventKind;
  before: Record<string, string | null>;
  after: Record<string, string | null>;
}

export function diffSubscriptionForEvents(
  before: SubscriptionSnapshot,
  after: SubscriptionSnapshot,
): SubscriptionEvent[] {
  const events: SubscriptionEvent[] = [];

  // Plano trocado absorve preço, custo e ciclo: foi tudo o mesmo clique.
  if (before.planId !== after.planId) {
    events.push({
      kind: 'SUBSCRIPTION_PLAN_CHANGED',
      before: { planId: before.planId, priceCents: before.priceCents, costCents: before.costCents, cycle: before.cycle },
      after: { planId: after.planId, priceCents: after.priceCents, costCents: after.costCents, cycle: after.cycle },
    });
  } else {
    if (before.priceCents !== after.priceCents || before.costCents !== after.costCents) {
      events.push({
        kind: 'SUBSCRIPTION_PRICE_EDITED',
        before: { priceCents: before.priceCents, costCents: before.costCents },
        after: { priceCents: after.priceCents, costCents: after.costCents },
      });
    }
    if (before.cycle !== after.cycle) {
      events.push({
        kind: 'SUBSCRIPTION_CYCLE_CHANGED',
        before: { cycle: before.cycle },
        after: { cycle: after.cycle },
      });
    }
  }

  if (before.nextDueAt !== after.nextDueAt) {
    events.push({
      kind: 'SUBSCRIPTION_DUE_DATE_EDITED',
      before: { nextDueAt: before.nextDueAt },
      after: { nextDueAt: after.nextDueAt },
    });
  }

  if (before.status !== after.status) {
    events.push({
      kind: 'SUBSCRIPTION_STATUS_CHANGED',
      before: { status: before.status },
      after: { status: after.status },
    });
  }

  return events;
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
pnpm test src/core/subscription-events.test.ts
```

Esperado: PASS, 5 testes.

- [ ] **Step 5: Escrever o teste de integração que falha**

Adicionar a `src/features/subscriptions/service.integration.test.ts`. O arquivo limpa fixtures inline em cada teste do `describe` de `changeSubscriptionPlan`; seguir o mesmo padrão, com `try/finally`:

```ts
describe('histórico financeiro da assinatura', () => {
  it('troca rápida de plano grava um SUBSCRIPTION_PLAN_CHANGED só', async () => {
    const customer = await db.customer.create({ data: { name: 'Cliente Log Assinatura' } });
    const plan = await db.plan.create({
      data: { name: `Plano Log ${randomUUID()}`, priceCents: 3500n, costCents: 1000n, cycle: 'MONTHLY' },
    });
    const subscription = await db.subscription.create({
      data: { customerId: customer.id, priceCents: 9000n, costCents: 3000n, cycle: 'QUARTERLY', nextDueAt: new Date() },
    });

    try {
      await changeSubscriptionPlan(subscription.id, customer.id, plan.id);

      const events = await db.financialEvent.findMany({ where: { customerId: customer.id } });
      expect(events).toHaveLength(1);
      expect(events[0].kind).toBe('SUBSCRIPTION_PLAN_CHANGED');
      expect((events[0].before as Record<string, string>).priceCents).toBe('9000');
      expect((events[0].after as Record<string, string>).priceCents).toBe('3500');
    } finally {
      await db.financialEvent.deleteMany({ where: { customerId: customer.id } });
      await db.subscription.delete({ where: { id: subscription.id } });
      await db.plan.delete({ where: { id: plan.id } });
      await db.customer.delete({ where: { id: customer.id } });
    }
  });

  // Guarda da união de `core/` contra o enum do Postgres: se alguém acrescentar
  // um kind em core/subscription-events.ts e esquecer da migration, o insert
  // estoura em produção, não aqui. Este teste traz a falha para o CI.
  it('todo kind de core/subscription-events existe no enum do banco', async () => {
    const customer = await db.customer.create({ data: { name: 'Cliente Log Enum' } });
    const kinds: SubscriptionEventKind[] = [
      'SUBSCRIPTION_PLAN_CHANGED',
      'SUBSCRIPTION_PRICE_EDITED',
      'SUBSCRIPTION_CYCLE_CHANGED',
      'SUBSCRIPTION_DUE_DATE_EDITED',
      'SUBSCRIPTION_STATUS_CHANGED',
    ];

    try {
      for (const kind of kinds) {
        await db.$transaction((tx) =>
          recordFinancialEvent(tx, {
            customerId: customer.id,
            entityType: 'SUBSCRIPTION',
            entityId: 'assinatura-qualquer',
            kind,
          }),
        );
      }

      expect(await db.financialEvent.count({ where: { customerId: customer.id } })).toBe(kinds.length);
    } finally {
      await db.financialEvent.deleteMany({ where: { customerId: customer.id } });
      await db.customer.delete({ where: { id: customer.id } });
    }
  });
});
```

Imports novos no topo do arquivo de teste:

```ts
import { recordFinancialEvent } from '@/lib/financial-events';
import type { SubscriptionEventKind } from '@/core/subscription-events';
```

- [ ] **Step 6: Rodar e ver falhar**

```bash
pnpm test:integration src/features/subscriptions/service.integration.test.ts
```

Esperado: o primeiro teste FAIL com `expected [] to have a length of 1`. O segundo passa desde já — é guarda.

- [ ] **Step 7: Implementar nos dois pontos de escrita**

Em `src/features/subscriptions/service.ts`, importar:

```ts
import { recordFinancialEvent } from '@/lib/financial-events';
import { diffSubscriptionForEvents, type SubscriptionSnapshot } from '@/core/subscription-events';
```

Helper privado no mesmo arquivo — converte a linha do Prisma no retrato achatado que `core/` compara:

```ts
/** Retrato achatado da assinatura para o histórico. Data vira 'YYYY-MM-DD' no
 *  fuso do negócio: vencimento é conceito local, e comparar ISO em UTC acusaria
 *  mudança onde só houve conversão. */
function snapshotSubscription(
  sub: { planId: string | null; priceCents: bigint; costCents: bigint; cycle: string; nextDueAt: Date; status: string },
  timezone: string,
): SubscriptionSnapshot {
  const local = localDateOnly(sub.nextDueAt, timezone);
  return {
    planId: sub.planId,
    priceCents: sub.priceCents.toString(),
    costCents: sub.costCents.toString(),
    cycle: sub.cycle,
    nextDueAt: local.toISOString().slice(0, 10),
    status: sub.status,
  };
}
```

Em `patchSubscription`, depois do `tx.subscription.update` e antes do `alignOpenChargeDueAt`:

```ts
  const events = diffSubscriptionForEvents(
    snapshotSubscription(existing, timezone),
    snapshotSubscription(updated, timezone),
  );
  for (const event of events) {
    await recordFinancialEvent(tx, {
      customerId: existing.customerId,
      entityType: 'SUBSCRIPTION',
      entityId: id,
      kind: event.kind,
      before: event.before,
      after: event.after,
    });
  }
```

⚠️ `await` dentro de `for` é N+1 e normalmente não passa em review (`.claude/rules/03-dados.md`). Aqui o N é no máximo 4, vem de campos de um formulário — não de linhas do banco — e a ordem das linhas importa para a leitura da ficha. Deixar o comentário explicando, senão vira apontamento em toda revisão futura.

Em `changeSubscriptionPlan`, dentro da transação, depois do `tx.subscription.update`:

```ts
    await recordFinancialEvent(tx, {
      customerId,
      entityType: 'SUBSCRIPTION',
      entityId: id,
      kind: 'SUBSCRIPTION_PLAN_CHANGED',
      before: {
        planId: before.planId,
        priceCents: before.priceCents.toString(),
        costCents: before.costCents.toString(),
        cycle: before.cycle,
      },
      after: {
        planId: plan.id,
        priceCents: plan.priceCents.toString(),
        costCents: plan.costCents.toString(),
        cycle: plan.cycle,
      },
    });
```

Para isso, o `findUnique` de `existing` no topo de `changeSubscriptionPlan` precisa passar a trazer `planId`, `priceCents`, `costCents` e `cycle` (hoje traz só `customerId` e `status`) — renomear a variável para `before` ou usar `existing` direto, desde que o `select` cubra os campos.

- [ ] **Step 8: Rodar e ver passar**

```bash
pnpm test:integration src/features/subscriptions/service.integration.test.ts
pnpm test src/core/subscription-events.test.ts
```

Esperado: PASS nos dois.

- [ ] **Step 9: Commit**

```bash
git add src/core/subscription-events.ts src/core/subscription-events.test.ts src/features/subscriptions/service.ts src/features/subscriptions/service.integration.test.ts
git commit -m "feat(subscriptions): assinatura registra um evento por decisão do operador

Trocar o plano mexe em plano, preço, custo e ciclo de uma vez. Quatro eventos
para um clique transformariam a linha do tempo da ficha em log de banco, e o
jeito mais rápido de fazer o operador parar de ler o histórico é enchê-lo de
ruído — então a troca de plano absorve os quatro campos num evento só.

O diff mora em core/ porque é decisão pura sobre dois retratos, testável em
milissegundos e sem banco."
```

---

### Task 4: A seção "Alterações" na ficha

**Files:**
- Modify: `src/features/customers/ficha-types.ts`
- Modify: `src/lib/labels.ts`
- Modify: `src/app/(app)/customers/ficha-action.ts`
- Create: `src/features/customers/components/ficha/ficha-events.tsx`
- Test: `src/features/customers/components/ficha/ficha-events.test.tsx`
- Modify: `src/features/customers/components/ficha/customer-ficha.tsx`

**Interfaces:**
- Consumes: `listFinancialEvents` da Task 1.
- Produces: `type FichaEventDTO = { id: string; kind: string; summary: string; reason: string | null; at: string }` em `ficha-types.ts`, e `CustomerFichaData.events: FichaEventDTO[]`.

- [ ] **Step 1: Escrever o teste que falha**

`src/features/customers/components/ficha/ficha-events.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FichaEvents } from './ficha-events';
import type { FichaEventDTO } from '../../ficha-types';

const TIMEZONE = 'America/Sao_Paulo';

function event(overrides: Partial<FichaEventDTO> = {}): FichaEventDTO {
  return {
    id: 'evento-1',
    kind: 'SUBSCRIPTION_PLAN_CHANGED',
    summary: 'Trimestral R$ 90,00 → Mensal R$ 35,00',
    reason: null,
    at: '2026-09-20T12:00:00.000Z',
    ...overrides,
  };
}

describe('FichaEvents', () => {
  it('mostra o rótulo em pt-BR e o resumo do que mudou', () => {
    render(<FichaEvents events={[event()]} timezone={TIMEZONE} />);

    expect(screen.getByText('Plano trocado')).toBeTruthy();
    expect(screen.getByText('Trimestral R$ 90,00 → Mensal R$ 35,00')).toBeTruthy();
  });

  it('mostra o motivo quando o operador escreveu um', () => {
    render(<FichaEvents events={[event({ reason: 'cliente pediu no WhatsApp' })]} timezone={TIMEZONE} />);

    expect(screen.getByText(/cliente pediu no WhatsApp/)).toBeTruthy();
  });

  // Empty state aponta para o que significa, não para "nenhum registro".
  it('sem eventos, explica que nada mudou ainda', () => {
    render(<FichaEvents events={[]} timezone={TIMEZONE} />);

    expect(screen.getByText(/Nada mudou nesta assinatura ainda/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
pnpm test src/features/customers/components/ficha/ficha-events.test.tsx
```

Esperado: FAIL no import — `Failed to resolve import "./ficha-events"`.

- [ ] **Step 3: Rótulos**

Em `src/lib/labels.ts`, ao lado dos outros mapas:

```ts
export const FINANCIAL_EVENT_LABELS: Record<string, string> = {
  SUBSCRIPTION_PLAN_CHANGED: 'Plano trocado',
  SUBSCRIPTION_PRICE_EDITED: 'Valor alterado',
  SUBSCRIPTION_CYCLE_CHANGED: 'Ciclo alterado',
  SUBSCRIPTION_DUE_DATE_EDITED: 'Vencimento alterado',
  SUBSCRIPTION_STATUS_CHANGED: 'Situação alterada',
  CHARGE_AMOUNT_EDITED: 'Valor da cobrança corrigido',
  CHARGE_REALIGNED: 'Cobrança atualizada pelo plano',
  CHARGE_CANCELLED: 'Cobrança cancelada',
  CHARGE_WRITTEN_OFF: 'Baixa do restante',
  PAYMENT_REGISTERED: 'Pagamento registrado',
  PAYMENT_REMOVED: 'Pagamento removido',
};
```

- [ ] **Step 4: O tipo e o carregamento**

Em `src/features/customers/ficha-types.ts`:

```ts
/** Uma linha da seção "Alterações". `summary` já vem montado do servidor —
 *  o componente não conhece o formato do payload de cada `kind`. */
export interface FichaEventDTO {
  id: string;
  kind: string;
  summary: string;
  reason: string | null;
  at: string;
}
```

E no `CustomerFichaData`, junto de `payments` e `messages`:

```ts
  events: FichaEventDTO[];
```

Em `src/app/(app)/customers/ficha-action.ts`, acrescentar `listFinancialEvents(customerId)` ao `Promise.all` que já busca as outras seis coisas, e montar o resumo:

```ts
import { listFinancialEvents } from '@/lib/financial-events';
import { formatCents } from '@/lib/format';
```

```ts
/** Resumo legível de um evento. Mora em `app/` com o resto da composição da
 *  ficha: é apresentação, não regra — e é aqui que o payload achatado volta a
 *  virar frase em pt-BR. */
function eventSummary(event: { kind: string; before: Record<string, string | null> | null; after: Record<string, string | null> | null }): string {
  const before = event.before ?? {};
  const after = event.after ?? {};

  const money = (from: string | null | undefined, to: string | null | undefined) =>
    from && to ? `${formatCents(from)} → ${formatCents(to)}` : '';

  switch (event.kind) {
    case 'SUBSCRIPTION_PLAN_CHANGED':
    case 'SUBSCRIPTION_PRICE_EDITED':
    case 'CHARGE_AMOUNT_EDITED':
      return money(before.priceCents ?? before.principalCents, after.priceCents ?? after.principalCents);
    case 'CHARGE_REALIGNED':
      return money(before.principalCents, after.principalCents);
    case 'CHARGE_WRITTEN_OFF':
      return money(before.discountCents, after.discountCents);
    case 'PAYMENT_REGISTERED':
    case 'PAYMENT_REMOVED':
      return after.amountCents ? formatCents(after.amountCents) : formatCents(before.amountCents ?? '0');
    case 'SUBSCRIPTION_DUE_DATE_EDITED':
      return `${before.nextDueAt ?? ''} → ${after.nextDueAt ?? ''}`;
    default:
      return `${before.cycle ?? before.status ?? ''} → ${after.cycle ?? after.status ?? ''}`;
  }
}
```

E no objeto `data`:

```ts
      events: events.map((event) => ({
        id: event.id,
        kind: event.kind,
        summary: eventSummary(event),
        reason: event.reason,
        at: event.at.toISOString(),
      })),
```

- [ ] **Step 5: O componente**

`src/features/customers/components/ficha/ficha-events.tsx`:

```tsx
import { formatLocalDate } from '@/lib/format';
import { FINANCIAL_EVENT_LABELS } from '@/lib/labels';
import type { FichaEventDTO } from '../../ficha-types';

/**
 * "O que mudou nesta assinatura" — a linha do tempo que responde por que o
 * cliente está no preço em que está. Lê `summary` pronto do servidor: o
 * payload de cada `kind` tem forma própria, e traduzir isso na tela espalharia
 * o conhecimento do log por dois lugares.
 */
export function FichaEvents({ events, timezone }: { events: FichaEventDTO[]; timezone: string }) {
  return (
    <section className="rounded border border-border bg-surface p-4">
      <p className="mb-2 text-xs font-bold uppercase tracking-[.08em] text-foreground-muted">Alterações</p>
      {events.length === 0 ? (
        <p className="text-sm text-foreground-muted">Nada mudou nesta assinatura ainda.</p>
      ) : (
        <ul>
          {events.map((event) => (
            <li key={event.id} className="flex flex-col gap-0.5 border-b border-border py-2 text-sm last:border-0">
              <div className="flex items-baseline gap-3">
                <span className="w-[74px] shrink-0 font-mono text-xs tabular-mono text-foreground-muted">
                  {formatLocalDate(event.at, timezone)}
                </span>
                <span className="text-foreground">{FINANCIAL_EVENT_LABELS[event.kind] ?? event.kind}</span>
                <span className="flex-1 truncate font-mono tabular-mono text-foreground-muted">{event.summary}</span>
              </div>
              {event.reason && <p className="pl-[86px] text-xs text-foreground-muted">{event.reason}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

E em `customer-ficha.tsx`, montar logo depois de `<FichaMessages ... />`:

```tsx
      <FichaEvents events={data.events} timezone={data.timezone} />
```

com o import correspondente.

- [ ] **Step 6: Rodar e ver passar**

```bash
pnpm test src/features/customers/components/ficha/ficha-events.test.tsx
pnpm typecheck
```

Esperado: PASS nos 3 testes; `typecheck` limpo. Se o `typecheck` reclamar de `events` faltando, algum outro ponto monta `CustomerFichaData` — procurar com `grep -rn "CustomerFichaData" src/` e preencher.

- [ ] **Step 7: Commit**

```bash
git add src/features/customers/ficha-types.ts src/lib/labels.ts "src/app/(app)/customers/ficha-action.ts" src/features/customers/components/ficha/ficha-events.tsx src/features/customers/components/ficha/ficha-events.test.tsx src/features/customers/components/ficha/customer-ficha.tsx
git commit -m "feat(customers): ficha mostra o que mudou na assinatura

O log só vale se alguém lê. A seção monta uma lista cronológica cruzando
assinatura, cobrança e pagamento — a história que o operador precisa para
saber por que este cliente está no preço em que está.

O resumo é montado no servidor: o payload de cada kind tem forma própria, e
traduzir isso na tela espalharia o conhecimento do log por dois lugares."
```

---

### Task 5: Anonimização limpa o motivo

**Files:**
- Modify: `src/app/(app)/customers/customer-anonymization.ts`
- Test: `src/app/(app)/customers/customer-anonymization.integration.test.ts`

**Interfaces:**
- Consumes: a tabela da Task 1 e os eventos das Tasks 2–3.
- Produces: nada novo.

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar a `src/app/(app)/customers/customer-anonymization.integration.test.ts` (o arquivo já tem fixtures de cliente e a chamada de `anonymizeCustomer`; reusar o padrão dele):

```ts
// `reason` é o único campo do log com risco de dado pessoal — o operador
// escreve livre e pode digitar o nome de quem pediu. O fato econômico fica:
// eliminar o valor destruiria o histórico financeiro que a LGPD preserva.
it('anonimizar limpa o motivo dos eventos e preserva os valores', async () => {
  await db.$transaction((tx) =>
    recordFinancialEvent(tx, {
      customerId,
      entityType: 'SUBSCRIPTION',
      entityId: 'assinatura-1',
      kind: 'SUBSCRIPTION_PRICE_EDITED',
      before: { priceCents: '9000', costCents: '3000' },
      after: { priceCents: '3500', costCents: '1000' },
      reason: 'combinado com a Maria por telefone',
    }),
  );

  await anonymizeCustomer(customerId, userId, new Date());

  const event = await db.financialEvent.findFirstOrThrow({ where: { customerId } });
  expect(event.reason).toBeNull();
  expect((event.after as Record<string, string>).priceCents).toBe('3500');
});
```

Import novo no topo do arquivo de teste:

```ts
import { recordFinancialEvent } from '@/lib/financial-events';
```

⚠️ O teste usa `buildAnonymizableCustomer(suffix)`, o helper que já existe no arquivo — ele cria a assinatura como `CANCELLED` de propósito, porque `assertAnonymizable` recusa cliente com assinatura `ACTIVE` ou cobrança em aberto. Criar o cliente à mão faz o teste falhar por `CustomerNotAnonymizableError`, não pela ausência da limpeza. O `customerId` do teste sai de `const { customer } = await buildAnonymizableCustomer('9')`, seguindo os outros testes do arquivo.

E `purge()`, no topo do arquivo, ganha a limpeza da tabela nova — antes do `deleteMany` de `payment`:

```ts
  await db.financialEvent.deleteMany({ where: { customerId: { in: createdCustomerIds } } });
```

⚠️ Recorte por id, e **não** `where: { customer }` como as outras linhas do `purge()` fazem: `financial_events` não tem relação com `customers` no Prisma (ver §Desvio consciente do spec), então o filtro aninhado nem compila.

- [ ] **Step 2: Rodar e ver falhar**

```bash
pnpm test:integration "src/app/(app)/customers/customer-anonymization.integration.test.ts"
```

Esperado: FAIL com `expected 'combinado com a Maria por telefone' to be null`.

- [ ] **Step 3: Implementar**

Em `src/app/(app)/customers/customer-anonymization.ts`, dentro da transação, junto das outras quatro limpezas:

```ts
    await scrubFinancialEventReasons(tx, customerId);
```

E em `src/lib/financial-events.ts`:

```ts
/**
 * Direito de eliminação (LGPD): `reason` é o único campo do log com risco de
 * dado pessoal — o operador escreve livre e pode citar nome de gente. Valor,
 * data e ids ficam: é o mesmo critério que preserva cobrança e pagamento, o
 * fato econômico sobrevive à eliminação da pessoa.
 */
export async function scrubFinancialEventReasons(
  tx: Prisma.TransactionClient,
  customerId: string,
): Promise<void> {
  await tx.financialEvent.updateMany({ where: { customerId }, data: { reason: null } });
}
```

com o import correspondente em `customer-anonymization.ts`.

- [ ] **Step 4: Rodar e ver passar**

```bash
pnpm test:integration "src/app/(app)/customers/customer-anonymization.integration.test.ts"
```

Esperado: PASS.

- [ ] **Step 5: Rodar tudo e conferir os portões**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm test:integration && pnpm build
```

Esperado: `typecheck` limpo; `lint` com 0 erros (warnings pré-existentes seguem); unit e integração verdes; build passa. ⚠️ Se a integração falhar em `mark-overdue` ou `getDueDateOverview`, é fixture vazada de algum teste que morreu no meio — essas duas suítes afirmam totais do banco inteiro. Limpar as linhas órfãs antes de concluir que há regressão.

- [ ] **Step 6: Documentar e commitar**

Em `CLAUDE.md`, §"Estado atual", acrescentar à lista do que existe: a ficha ganhou a seção **Alterações**, alimentada por `financial_events` — toda mutação de assinatura, cobrança e pagamento grava antes/depois no mesmo commit da transação, e a anonimização limpa o motivo.

Em `docs/projeto/tecnico/02-modelo-de-dados.md`, acrescentar `FinancialEvent` à lista de modelos, com a nota de que não tem FK de propósito.

```bash
git add src/lib/financial-events.ts "src/app/(app)/customers/customer-anonymization.ts" "src/app/(app)/customers/customer-anonymization.integration.test.ts" CLAUDE.md docs/projeto/tecnico/02-modelo-de-dados.md
git commit -m "feat(customers): anonimização limpa o motivo dos eventos financeiros

reason é texto livre do operador e o único campo do log com risco de dado
pessoal. Valor, data e ids ficam: é o mesmo critério que já preserva cobrança
e pagamento — o fato econômico sobrevive à eliminação da pessoa."
```

---

## Depois desta fatia

A fatia 2 (`editChargeAmount`, piso no realinhamento, recorte de `periodEnd`, `removePayment` com a cascata do `openNextCycle`, e a mudança das regras duras no `CLAUDE.md`) ganha plano próprio, escrito quando esta estiver no ar — é o log desta fatia que torna aquele afrouxamento aceitável, e o formato final dos eventos aqui é o que aquele plano vai consumir.
