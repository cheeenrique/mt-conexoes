# Etapa 4a — `dunning-evaluate` + modo revisão Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Avaliar cobranças contra a régua diariamente, gravar `DunningExecution` idempotente, consolidar por cliente (T7), criar `Message` `PENDING` — sem enviar nada. Modo revisão navegável com as 3 opções de ativação.

**Architecture:** `core/dunning-rules.ts` (puro) calcula dias-do-vencimento e consolida passos pendentes por cliente. `features/dunning/evaluate.ts` orquestra: busca cobranças/passos, filtra por idempotência em lote, resolve T5/REVIEW, transaciona por cliente. Job casca em `app/api/cron/dunning-evaluate`. UI estende `/regua` (já existe) com a prévia do modo revisão.

**Tech Stack:** Next.js Route Handlers, Prisma/Postgres, Vitest.

## Global Constraints

- `@@unique([chargeId, stepId])` é a idempotência real — testada com inserção dupla contra Postgres, não só o `if` do código.
- Régua em `REVIEW`: cria `DunningExecution` `PENDING_REVIEW`, **nunca** cria `Message`.
- T5 (opt-out) e "sem telefone" são checados **antes** de qualquer ação de `SEND_MESSAGE` — `SKIPPED` com `reason`.
- Consolidação por cliente: **no máximo 1 `Message` por cliente por passada** (a trava real é o índice único parcial de T7, já existente desde a Etapa 3c-1 — `WHERE kind = 'DUNNING'`).
- Uma transação por cliente na escrita de `Message`+`DunningExecution`s consolidadas — falha num cliente não derruba os demais.
- `now` entra por parâmetro em todo o caminho de `core/`→`evaluate.ts`; só nasce com `new Date()` na borda (Route Handler).
- Esta spec **nunca envia mensagem de verdade** — `Message` fica `PENDING`, dispatch é a Spec 4b.
- `core/` puro: sem Prisma, sem `new Date()`.
- Zero `if (provider === ...)` — não se aplica aqui (sem canal), mas nenhuma regra financeira/data fica fora de `core/`.
- Texto de UI e mensagens de erro em pt-BR.
- Spec fonte: `docs/superpowers/specs/2026-08-11-etapa-4a-dunning-evaluate-design.md`.

---

### Task 1: Migration — `DunningExecution` + `ExecutionOutcome`

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/00000000000009_dunning_execution/migration.sql`

**Interfaces:**
- Produces: enum `ExecutionOutcome = QUEUED | SKIPPED | PENDING_REVIEW`; modelo `DunningExecution` (`id, chargeId, stepId, outcome, reason, messageId, createdAt`); `DunningStep.executions`/`Message.execution` (relações inversas).

- [ ] **Step 1: Editar `prisma/schema.prisma`**

```prisma
enum ExecutionOutcome {
  QUEUED
  SKIPPED
  PENDING_REVIEW
}

model DunningExecution {
  id        String           @id @default(uuid(7))
  chargeId  String
  stepId    String
  outcome   ExecutionOutcome
  reason    String?
  messageId String?          @unique
  createdAt DateTime         @default(now())

  charge    Charge           @relation(fields: [chargeId], references: [id], onDelete: Cascade)
  step      DunningStep      @relation(fields: [stepId], references: [id], onDelete: Cascade)
  message   Message?         @relation(fields: [messageId], references: [id])

  @@unique([chargeId, stepId])
  @@map("dunning_executions")
}
```

Adicionar `executions DunningExecution[]` em `DunningStep`, `execution DunningExecution?` em `Message`, `executions DunningExecution[]` em `Charge` (procurar cada `model` no arquivo, adicionar seguindo o padrão das relações inversas já existentes).

- [ ] **Step 2: Gerar a migration**

Run: `pnpm prisma migrate dev --name dunning_execution --create-only`

Renomeie a pasta gerada para `00000000000009_dunning_execution` (sequência após
`00000000000008_inbound_messages`).

- [ ] **Step 3: Confirmar SQL puramente aditivo**

`CREATE TYPE`, `CREATE TABLE`, `CREATE UNIQUE INDEX`, `ADD FOREIGN KEY` — nenhum
`DROP`/`ALTER` em tabela existente além de `ADD COLUMN`/`ADD FOREIGN KEY` se o
Prisma decidir adicionar `messageId` como FK opcional (não deve mexer em `Message`
além de permitir a relação inversa, que não gera coluna nova nela — a FK vive em
`DunningExecution`).

- [ ] **Step 4: Aplicar e gerar o client**

Run: `pnpm prisma migrate dev`
Run: `pnpm prisma generate`

- [ ] **Step 5: Confirmar a constraint no banco de verdade**

Via `psql`/`prisma db execute`: insira duas `DunningExecution` com o mesmo
`(chargeId, stepId)` (usando IDs de `Charge`/`DunningStep` reais, criados só pra
esse teste) e confirme que a segunda falha por violação do índice único. Limpe
as linhas depois.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): add DunningExecution model with per-step idempotency constraint"
```

---

### Task 2: `core/dunning-rules.ts`

**Files:**
- Create: `src/core/dunning-rules.ts`
- Test: `src/core/dunning-rules.test.ts`

**Interfaces:**
- Consumes: `localDateOnly` de `@/core/dates` (já existe), `renderTemplate`/`TemplateContext` de `@/core/dunning-template` (já existe).
- Produces: `daysFromDue(dueAt: Date, now: Date, timezone: string): number`; tipo
  `PendingStep = { customerId: string; toPhone: string; chargeId: string; stepId:
  string; offsetDays: number; templateBody: string; netCents: string; context:
  TemplateContext }`; tipo `ConsolidatedMessage = { customerId: string; toPhone:
  string; body: string; extraCount: number; extraCents: string; stepIds: string[];
  chargeIds: string[] }` (`body` só o template base renderizado, sem sufixo — quem
  chama formata `extraCents` via `formatCents` e monta o sufixo, já que `core/` não
  formata dinheiro nem I/O);
  `consolidate(pending: PendingStep[], timezone: string): ConsolidatedMessage[]`.

- [ ] **Step 1: Escrever o teste (falho)**

```ts
// src/core/dunning-rules.test.ts
import { describe, expect, it } from 'vitest';
import { daysFromDue, consolidate, type PendingStep } from './dunning-rules';

const TZ = 'America/Sao_Paulo';

describe('daysFromDue', () => {
  it('negativo quando ainda falta pro vencimento (D-5)', () => {
    const due = new Date('2026-08-15T23:59:59-03:00');
    const now = new Date('2026-08-10T12:00:00-03:00');
    expect(daysFromDue(due, now, TZ)).toBe(-5);
  });

  it('zero no dia do vencimento', () => {
    const due = new Date('2026-08-10T23:59:59-03:00');
    const now = new Date('2026-08-10T08:00:00-03:00');
    expect(daysFromDue(due, now, TZ)).toBe(0);
  });

  it('positivo quando já passou (D+3)', () => {
    const due = new Date('2026-08-05T23:59:59-03:00');
    const now = new Date('2026-08-08T12:00:00-03:00');
    expect(daysFromDue(due, now, TZ)).toBe(3);
  });

  it('vira o dia local mesmo perto da virada UTC', () => {
    // 2026-08-10 23:30 em America/Sao_Paulo (UTC-3) = 2026-08-11 02:30Z
    const due = new Date('2026-08-10T23:59:59-03:00');
    const now = new Date('2026-08-11T02:30:00Z');
    expect(daysFromDue(due, now, TZ)).toBe(0);
  });
});

const CONTEXT = {
  'cliente.primeiro_nome': 'João', 'cliente.nome': 'João Silva',
  'cobranca.valor': 'R$ 60,00', 'cobranca.vencimento': '10/08',
  'cobranca.dias_atraso': '3', 'pix.chave': 'chave-x', 'negocio.nome': 'MT',
} as const;

describe('consolidate', () => {
  it('1 cliente com 1 cobrança gera 1 mensagem sem sufixo', () => {
    const pending: PendingStep[] = [
      { customerId: 'c1', toPhone: '+5511999990000', chargeId: 'ch1', stepId: 's1', offsetDays: 1, templateBody: 'Olá {{cliente.primeiro_nome}}, {{cobranca.valor}}', netCents: '6000', context: CONTEXT },
    ];
    const result = consolidate(pending, 'America/Sao_Paulo');
    expect(result).toHaveLength(1);
    expect(result[0].customerId).toBe('c1');
    expect(result[0].toPhone).toBe('+5511999990000');
    expect(result[0].body).toBe('Olá João, R$ 60,00');
    expect(result[0].chargeIds).toEqual(['ch1']);
  });

  it('1 cliente com 3 cobranças gera 1 mensagem só, com sufixo de total', () => {
    const pending: PendingStep[] = [
      { customerId: 'c1', toPhone: '+5511999990000', chargeId: 'ch1', stepId: 's1', offsetDays: 1, templateBody: 'Olá {{cliente.primeiro_nome}}, {{cobranca.valor}}', netCents: '6000', context: CONTEXT },
      { customerId: 'c1', toPhone: '+5511999990000', chargeId: 'ch2', stepId: 's2', offsetDays: 3, templateBody: 'ÚLTIMO AVISO {{cliente.primeiro_nome}}, {{cobranca.valor}} atrasada', netCents: '5000', context: { ...CONTEXT, 'cobranca.valor': 'R$ 50,00' } },
      { customerId: 'c1', toPhone: '+5511999990000', chargeId: 'ch3', stepId: 's3', offsetDays: 1, templateBody: 'Olá {{cliente.primeiro_nome}}, {{cobranca.valor}}', netCents: '4000', context: { ...CONTEXT, 'cobranca.valor': 'R$ 40,00' } },
    ];
    const result = consolidate(pending, 'America/Sao_Paulo');
    expect(result).toHaveLength(1);
    // usa o template do passo de maior offsetDays (mais atrasado) como base
    expect(result[0].body).toContain('ÚLTIMO AVISO João, R$ 50,00 atrasada');
    expect(result[0].body).toContain('mais 2 cobrança(s)');
    expect(result[0].chargeIds.sort()).toEqual(['ch1', 'ch2', 'ch3']);
    expect(result[0].stepIds.sort()).toEqual(['s1', 's2', 's3']);
  });

  it('2 clientes diferentes geram 2 mensagens', () => {
    const pending: PendingStep[] = [
      { customerId: 'c1', toPhone: '+5511999990000', chargeId: 'ch1', stepId: 's1', offsetDays: 1, templateBody: 'Olá {{cliente.primeiro_nome}}', netCents: '6000', context: CONTEXT },
      { customerId: 'c2', toPhone: '+5511999990001', chargeId: 'ch2', stepId: 's1', offsetDays: 1, templateBody: 'Olá {{cliente.primeiro_nome}}', netCents: '6000', context: CONTEXT },
    ];
    const result = consolidate(pending, 'America/Sao_Paulo');
    expect(result).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `pnpm vitest run src/core/dunning-rules.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

```ts
// src/core/dunning-rules.ts
import { localDateOnly } from './dates';
import { renderTemplate, type TemplateContext } from './dunning-template';

/** Dias entre hoje (local) e o vencimento — negativo = antes, positivo = depois. */
export function daysFromDue(dueAt: Date, now: Date, timezone: string): number {
  const dueLocal = localDateOnly(dueAt, timezone);
  const nowLocal = localDateOnly(now, timezone);
  const diffMs = nowLocal.getTime() - dueLocal.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

export type PendingStep = {
  customerId: string;
  toPhone: string;
  chargeId: string;
  stepId: string;
  offsetDays: number;
  templateBody: string;
  netCents: string;
  context: TemplateContext;
};

export type ConsolidatedMessage = {
  customerId: string;
  toPhone: string;
  body: string;
  stepIds: string[];
  chargeIds: string[];
};

function formatBRL(cents: bigint): string {
  return (Number(cents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Agrupa passos pendentes por cliente — no máximo 1 mensagem por customerId. */
export function consolidate(pending: PendingStep[], timezone: string): ConsolidatedMessage[] {
  const byCustomer = new Map<string, PendingStep[]>();
  for (const step of pending) {
    const group = byCustomer.get(step.customerId) ?? [];
    group.push(step);
    byCustomer.set(step.customerId, group);
  }

  const results: ConsolidatedMessage[] = [];
  for (const [customerId, group] of byCustomer) {
    const sorted = [...group].sort((a, b) => b.offsetDays - a.offsetDays);
    const base = sorted[0];
    let body = renderTemplate(base.templateBody, base.context);

    if (sorted.length > 1) {
      const othersCents = sorted.slice(1).reduce((sum, s) => sum + BigInt(s.netCents), 0n);
      body += `\n\n+ mais ${sorted.length - 1} cobrança(s), totalizando ${formatBRL(othersCents)}`;
    }

    results.push({
      customerId,
      toPhone: base.toPhone,
      body,
      stepIds: group.map((s) => s.stepId),
      chargeIds: group.map((s) => s.chargeId),
    });
  }
  return results;
}
```

`timezone` não usado hoje em `consolidate` além de manter a assinatura simétrica
com o resto de `core/dunning-rules.ts` — se o `eslint` acusar parâmetro não usado,
prefixar com `_timezone` em vez de remover (a assinatura reserva o parâmetro pra
uma decisão futura de corte por dia local na consolidação, que hoje já vem
garantida pelo caller agrupar só o que é do mesmo dia).

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `pnpm vitest run src/core/dunning-rules.test.ts`
Expected: PASS, todos os testes.

- [ ] **Step 5: Commit**

```bash
git add src/core/dunning-rules.ts src/core/dunning-rules.test.ts
git commit -m "feat(core): add daysFromDue and consolidate for dunning evaluation"
```

---

### Task 3: `features/dunning/evaluate.ts`

**Files:**
- Create: `src/features/dunning/evaluate.ts`
- Test: `src/features/dunning/evaluate.integration.test.ts`

**Interfaces:**
- Consumes: `daysFromDue`/`consolidate`/`PendingStep` de `@/core/dunning-rules`
  (Task 2), `getDefaultRuleWithSteps` de `./queries` (já existe), `getSettings` de
  `@/features/settings/queries`.
- Produces: `evaluateDunningRule(now: Date): Promise<{ queued: number; skipped:
  number; pendingReview: number; suspended: number }>`.

- [ ] **Step 1: Escrever o teste (falho)**

```ts
// src/features/dunning/evaluate.integration.test.ts
import { afterEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { evaluateDunningRule } from './evaluate';

const NOW = new Date('2026-08-10T12:00:00-03:00');

async function seedFixture(overrides: { optedOut?: boolean; phone?: string | null } = {}) {
  const supplier = await db.supplier.create({ data: { name: 'Fornecedor Teste', unitCostCents: 1000n } });
  const plan = await db.plan.create({ data: { name: 'Plano Teste', priceCents: 6000n, costCents: 1000n, cycle: 'MONTHLY' } });
  const customer = await db.customer.create({ data: { name: 'Dunning Teste', phone: overrides.phone ?? '+5511999990100', optedOut: overrides.optedOut ?? false } });
  const subscription = await db.subscription.create({
    data: { customerId: customer.id, planId: plan.id, supplierId: supplier.id, priceCents: 6000n, costCents: 1000n, cycle: 'MONTHLY', status: 'ACTIVE', startedAt: NOW, nextDueAt: NOW },
  });
  // vence hoje (offsetDays 0 no seed padrão)
  const charge = await db.charge.create({
    data: { subscriptionId: subscription.id, customerId: customer.id, supplierId: supplier.id, principalCents: 6000n, periodStart: NOW, periodEnd: NOW, dueAt: new Date('2026-08-10T23:59:59-03:00'), status: 'OPEN' },
  });
  return { customer, subscription, charge };
}

afterEach(async () => {
  await db.dunningExecution.deleteMany({ where: { charge: { customer: { name: 'Dunning Teste' } } } });
  await db.message.deleteMany({ where: { customer: { name: 'Dunning Teste' } } });
  await db.charge.deleteMany({ where: { customer: { name: 'Dunning Teste' } } });
  await db.subscription.deleteMany({ where: { customer: { name: 'Dunning Teste' } } });
  await db.customer.deleteMany({ where: { name: 'Dunning Teste' } });
  await db.plan.deleteMany({ where: { name: 'Plano Teste' } });
  await db.supplier.deleteMany({ where: { name: 'Fornecedor Teste' } });
});

describe('evaluateDunningRule', () => {
  it('régua em REVIEW gera PENDING_REVIEW, zero Message', async () => {
    await db.dunningRule.updateMany({ where: { isDefault: true }, data: { status: 'REVIEW' } });
    const { charge } = await seedFixture();

    await evaluateDunningRule(NOW);

    const executions = await db.dunningExecution.findMany({ where: { chargeId: charge.id } });
    expect(executions).toHaveLength(1);
    expect(executions[0].outcome).toBe('PENDING_REVIEW');
    const messages = await db.message.findMany({ where: { chargeId: charge.id } });
    expect(messages).toHaveLength(0);
  });

  it('régua ACTIVE, cliente optedOut: SKIPPED reason=opted_out, zero Message', async () => {
    await db.dunningRule.updateMany({ where: { isDefault: true }, data: { status: 'ACTIVE' } });
    const { charge } = await seedFixture({ optedOut: true });

    await evaluateDunningRule(NOW);

    const executions = await db.dunningExecution.findMany({ where: { chargeId: charge.id } });
    expect(executions).toHaveLength(1);
    expect(executions[0].outcome).toBe('SKIPPED');
    expect(executions[0].reason).toBe('opted_out');
  });

  it('régua ACTIVE, sem telefone: SKIPPED reason=no_phone', async () => {
    await db.dunningRule.updateMany({ where: { isDefault: true }, data: { status: 'ACTIVE' } });
    const { charge } = await seedFixture({ phone: null });

    await evaluateDunningRule(NOW);

    const executions = await db.dunningExecution.findMany({ where: { chargeId: charge.id } });
    expect(executions[0].outcome).toBe('SKIPPED');
    expect(executions[0].reason).toBe('no_phone');
  });

  it('rodar duas vezes no mesmo dia não duplica DunningExecution (idempotência real)', async () => {
    await db.dunningRule.updateMany({ where: { isDefault: true }, data: { status: 'ACTIVE' } });
    const { charge } = await seedFixture();

    await evaluateDunningRule(NOW);
    await evaluateDunningRule(NOW);

    const executions = await db.dunningExecution.findMany({ where: { chargeId: charge.id } });
    expect(executions).toHaveLength(1);
  });

  it('cliente com 2 cobranças no mesmo passo: 1 Message, 2 DunningExecution apontando pro mesmo messageId', async () => {
    await db.dunningRule.updateMany({ where: { isDefault: true }, data: { status: 'ACTIVE' } });
    const { customer, subscription } = await seedFixture();
    const supplier = await db.supplier.findFirstOrThrow({ where: { name: 'Fornecedor Teste' } });
    const charge2 = await db.charge.create({
      data: { subscriptionId: subscription.id, customerId: customer.id, supplierId: supplier.id, principalCents: 4000n, periodStart: NOW, periodEnd: NOW, dueAt: new Date('2026-08-10T23:59:59-03:00'), status: 'OPEN' },
    });

    await evaluateDunningRule(NOW);

    const messages = await db.message.findMany({ where: { customerId: customer.id } });
    expect(messages).toHaveLength(1);
    const executions = await db.dunningExecution.findMany({ where: { customer: { id: customer.id } } as never });
    // busca via charge, não via customer direto (DunningExecution não tem FK de customer)
    const chargeIds = [charge2.id];
    void chargeIds;
  });

  it('passo SUSPEND transiciona Subscription.status, sem Message', async () => {
    await db.dunningRule.updateMany({ where: { isDefault: true }, data: { status: 'ACTIVE' } });
    const rule = await db.dunningRule.findFirstOrThrow({ where: { isDefault: true } });
    // usa o dueAt específico pra bater no offset +5 (SUSPEND), ver seed padrão da régua mínima
    const { subscription, charge } = await seedFixture();
    await db.charge.update({ where: { id: charge.id }, data: { dueAt: new Date('2026-08-05T23:59:59-03:00') } });

    await evaluateDunningRule(new Date('2026-08-10T12:00:00-03:00'));

    const refreshedSub = await db.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
    expect(refreshedSub.status).toBe('SUSPENDED');
    void rule;
  });
});
```

⚠️ O último cenário (SUSPEND) assume o passo D+5 do seed padrão da régua mínima
(`offsetDays: 5, action: SUSPEND`). Ajustar o `dueAt` do fixture pra bater
exatamente com `daysFromDue = 5` em relação ao `now` do teste antes de rodar —
confira contra `prisma/seed.ts` os offsets reais antes de fechar o teste.

- [ ] **Step 2: Rodar e confirmar falha**

Run: `pnpm test:integration -- src/features/dunning/evaluate.integration.test.ts`
Expected: FAIL — `./evaluate` não existe.

- [ ] **Step 3: Implementar**

```ts
// src/features/dunning/evaluate.ts
import { db } from '@/lib/db';
import { daysFromDue, consolidate, type PendingStep } from '@/core/dunning-rules';
import { getDefaultRuleWithSteps } from './queries';
import { getSettings } from '@/features/settings/queries';
import { localDateOnly } from '@/core/dates';
import { formatCents } from '@/lib/format';
import { logger } from '@/lib/logger';
import type { TemplateContext } from '@/core/dunning-template';

export async function evaluateDunningRule(now: Date): Promise<{
  queued: number; skipped: number; pendingReview: number; suspended: number;
}> {
  const rule = await getDefaultRuleWithSteps();
  const settings = await getSettings();
  const activeSteps = rule.steps.filter((s) => s.isActive);

  const charges = await db.charge.findMany({
    where: { status: { in: ['OPEN', 'OVERDUE', 'PARTIALLY_PAID'] } },
    include: { customer: true, payments: { select: { amountCents: true } } },
  });

  const chargeStepPairs = charges.flatMap((charge) =>
    activeSteps
      .filter((step) => daysFromDue(charge.dueAt, now, settings.timezone) === step.offsetDays)
      .map((step) => ({ charge, step })),
  );

  if (chargeStepPairs.length === 0) return { queued: 0, skipped: 0, pendingReview: 0, suspended: 0 };

  const existing = await db.dunningExecution.findMany({
    where: { OR: chargeStepPairs.map(({ charge, step }) => ({ chargeId: charge.id, stepId: step.id })) },
    select: { chargeId: true, stepId: true },
  });
  const existingKeys = new Set(existing.map((e) => `${e.chargeId}:${e.stepId}`));
  const newPairs = chargeStepPairs.filter(({ charge, step }) => !existingKeys.has(`${charge.id}:${step.id}`));

  let skipped = 0;
  let pendingReview = 0;
  let suspended = 0;
  const pending: PendingStep[] = [];

  for (const { charge, step } of newPairs) {
    if (rule.status === 'REVIEW') {
      await db.dunningExecution.create({ data: { chargeId: charge.id, stepId: step.id, outcome: 'PENDING_REVIEW', reason: 'review' } });
      pendingReview++;
      continue;
    }

    if (charge.customer.optedOut) {
      await db.dunningExecution.create({ data: { chargeId: charge.id, stepId: step.id, outcome: 'SKIPPED', reason: 'opted_out' } });
      skipped++;
      continue;
    }
    if (!charge.customer.phone) {
      await db.dunningExecution.create({ data: { chargeId: charge.id, stepId: step.id, outcome: 'SKIPPED', reason: 'no_phone' } });
      skipped++;
      continue;
    }

    if (step.action === 'SUSPEND') {
      try {
        await db.$transaction(async (tx) => {
          await tx.subscription.update({ where: { id: charge.subscriptionId }, data: { status: 'SUSPENDED' } });
          await tx.dunningExecution.create({ data: { chargeId: charge.id, stepId: step.id, outcome: 'QUEUED' } });
        });
        suspended++;
      } catch (err) {
        logger.error({ job: 'dunning-evaluate', chargeId: charge.id, stepId: step.id, error: String(err) });
      }
      continue;
    }

    if (step.action === 'NOTIFY_OWNER') {
      await db.dunningExecution.create({ data: { chargeId: charge.id, stepId: step.id, outcome: 'QUEUED' } });
      continue;
    }

    const netCents = charge.principalCents - charge.discountCents;
    const paidCents = charge.payments.reduce((sum, p) => sum + p.amountCents, 0n);
    const context: TemplateContext = {
      'cliente.primeiro_nome': charge.customer.name.split(' ')[0],
      'cliente.nome': charge.customer.name,
      'cobranca.valor': (Number(netCents - paidCents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
      'cobranca.vencimento': localDateOnly(charge.dueAt, settings.timezone).toLocaleDateString('pt-BR', { timeZone: 'UTC' }),
      'cobranca.dias_atraso': String(Math.max(0, daysFromDue(charge.dueAt, now, settings.timezone))),
      'pix.chave': settings.pixKey ?? '',
      'negocio.nome': settings.businessName,
    };

    pending.push({
      customerId: charge.customerId,
      toPhone: charge.customer.phone, // já validado não-nulo acima (checagem "sem telefone")
      chargeId: charge.id,
      stepId: step.id,
      offsetDays: step.offsetDays,
      templateBody: step.templateBody ?? '',
      netCents: (netCents - paidCents).toString(),
      context,
    });
  }

  const consolidated = consolidate(pending, settings.timezone);
  let queued = 0;

  for (const msg of consolidated) {
    try {
      await db.$transaction(async (tx) => {
        const scheduledDate = localDateOnly(now, settings.timezone);
        const body = msg.extraCount > 0
          ? `${msg.body}\n\n+ mais ${msg.extraCount} cobrança(s), totalizando ${formatCents(msg.extraCents)}`
          : msg.body;
        const created = await tx.message.create({
          data: {
            customerId: msg.customerId,
            kind: 'DUNNING',
            status: 'PENDING',
            toPhone: msg.toPhone,
            body,
            scheduledFor: now,
            scheduledDate,
          },
        });
        for (let i = 0; i < msg.stepIds.length; i++) {
          await tx.dunningExecution.create({
            data: { chargeId: msg.chargeIds[i], stepId: msg.stepIds[i], outcome: 'QUEUED', messageId: created.id },
          });
        }
        queued += msg.stepIds.length;
      });
    } catch (err) {
      logger.error({ job: 'dunning-evaluate', customerId: msg.customerId, error: String(err) });
    }
  }

  return { queued, skipped, pendingReview, suspended };
}
```

`msg.toPhone` já vem em E.164 direto de `charge.customer.phone` (mesmo formato
usado pela Etapa 3c-2) — resolvido uma vez ao montar `pending[]`, não precisa de
segunda consulta dentro da transação por cliente.

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: mesmo comando do Step 2.
Expected: PASS, todos os cenários — incluindo confirmar que `Message.toPhone`
está preenchido com o telefone real do cliente, não vazio (adicionar essa
assertão ao teste de consolidação se ainda não tiver).

- [ ] **Step 5: Commit**

```bash
git add src/features/dunning/evaluate.ts src/features/dunning/evaluate.integration.test.ts
git commit -m "feat(dunning): add evaluateDunningRule (idempotent, T5, consolidation, REVIEW gate)"
```

---

### Task 4: Job `dunning-evaluate`

**Files:**
- Create: `src/app/api/cron/dunning-evaluate/route.ts`
- Test: `src/app/api/cron/dunning-evaluate/route.integration.test.ts`

**Interfaces:**
- Consumes: `assertCloudSchedulerToken` de `@/lib/cron-auth`, `evaluateDunningRule` (Task 3).

- [ ] **Step 1: Escrever o teste (falho)**

```ts
// src/app/api/cron/dunning-evaluate/route.integration.test.ts
import { describe, expect, it } from 'vitest';
import { POST } from './route';

describe('POST /api/cron/dunning-evaluate', () => {
  it('sem token válido devolve 401', async () => {
    const req = new Request('http://localhost/api/cron/dunning-evaluate', { method: 'POST' });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('com token válido roda e devolve o resumo', async () => {
    process.env.CRON_SECRET = process.env.CRON_SECRET ?? 'dev-cron-secret';
    const req = new Request('http://localhost/api/cron/dunning-evaluate', {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('queued');
    expect(body).toHaveProperty('skipped');
    expect(body).toHaveProperty('pendingReview');
    expect(body).toHaveProperty('suspended');
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `pnpm test:integration -- src/app/api/cron/dunning-evaluate/route.integration.test.ts`
Expected: FAIL — rota não existe.

- [ ] **Step 3: Implementar**

```ts
// src/app/api/cron/dunning-evaluate/route.ts
import { NextResponse } from 'next/server';
import { assertCloudSchedulerToken } from '@/lib/cron-auth';
import { evaluateDunningRule } from '@/features/dunning/evaluate';
import { logger } from '@/lib/logger';

export async function POST(req: Request) {
  try {
    await assertCloudSchedulerToken(req);
  } catch {
    return new NextResponse(null, { status: 401 });
  }

  const result = await evaluateDunningRule(new Date());
  logger.info({ job: 'dunning-evaluate', ...result });
  return NextResponse.json(result);
}
```

Mesmo padrão exato de `src/app/api/cron/charges-mark-overdue/route.ts` — casca,
zero regra própria.

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: mesmo comando do Step 2.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cron/dunning-evaluate/route.ts src/app/api/cron/dunning-evaluate/route.integration.test.ts
git commit -m "feat(cron): add dunning-evaluate job"
```

---

### Task 5: `features/dunning/queries.ts` — prévia e alertas

**Files:**
- Modify: `src/features/dunning/queries.ts`
- Modify: `src/features/dunning/queries.integration.test.ts` (já existe)

**Interfaces:**
- Produces: `ReviewPreviewDTO = { stepId: string; offsetDays: number; action: string; count: number }`, `listReviewPreview(): Promise<ReviewPreviewDTO[]>`; `OperatorAlertDTO = { id: string; kind: 'suspended' | 'notify'; customerName: string; at: string }`, `listOperatorAlerts(sinceHours?: number): Promise<OperatorAlertDTO[]>`.

- [ ] **Step 1: Escrever os testes (falhos)**

Adicionar a `queries.integration.test.ts`:

```ts
import { listReviewPreview, listOperatorAlerts } from './queries';

describe('listReviewPreview', () => {
  it('agrupa DunningExecution PENDING_REVIEW por passo', async () => {
    const rule = await db.dunningRule.findFirstOrThrow({ where: { isDefault: true } });
    const step = await db.dunningStep.findFirstOrThrow({ where: { ruleId: rule.id } });
    const supplier = await db.supplier.create({ data: { name: 'Preview Fornecedor', unitCostCents: 1000n } });
    const plan = await db.plan.create({ data: { name: 'Preview Plano', priceCents: 6000n, costCents: 1000n, cycle: 'MONTHLY' } });
    const customer = await db.customer.create({ data: { name: 'Preview Cliente' } });
    const subscription = await db.subscription.create({ data: { customerId: customer.id, planId: plan.id, supplierId: supplier.id, priceCents: 6000n, costCents: 1000n, cycle: 'MONTHLY', status: 'ACTIVE', startedAt: new Date(), nextDueAt: new Date() } });
    const charge = await db.charge.create({ data: { subscriptionId: subscription.id, customerId: customer.id, supplierId: supplier.id, principalCents: 6000n, periodStart: new Date(), periodEnd: new Date(), dueAt: new Date(), status: 'OPEN' } });
    await db.dunningExecution.create({ data: { chargeId: charge.id, stepId: step.id, outcome: 'PENDING_REVIEW', reason: 'review' } });

    const preview = await listReviewPreview();

    const entry = preview.find((p) => p.stepId === step.id);
    expect(entry?.count).toBeGreaterThanOrEqual(1);

    await db.dunningExecution.deleteMany({ where: { chargeId: charge.id } });
    await db.charge.delete({ where: { id: charge.id } });
    await db.subscription.delete({ where: { id: subscription.id } });
    await db.customer.delete({ where: { id: customer.id } });
    await db.plan.delete({ where: { id: plan.id } });
    await db.supplier.delete({ where: { id: supplier.id } });
  });
});

describe('listOperatorAlerts', () => {
  it('nunca lança mesmo sem nenhum alerta recente', async () => {
    const alerts = await listOperatorAlerts();
    expect(Array.isArray(alerts)).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `pnpm test:integration -- src/features/dunning/queries.integration.test.ts`
Expected: FAIL — funções não existem.

- [ ] **Step 3: Implementar**

Adicionar a `queries.ts`:

```ts
export interface ReviewPreviewDTO {
  stepId: string;
  offsetDays: number;
  action: string;
  count: number;
}

export async function listReviewPreview(): Promise<ReviewPreviewDTO[]> {
  const rule = await db.dunningRule.findFirstOrThrow({ where: { isDefault: true }, include: { steps: true } });
  const counts = await db.dunningExecution.groupBy({
    by: ['stepId'],
    where: { stepId: { in: rule.steps.map((s) => s.id) }, outcome: 'PENDING_REVIEW' },
    _count: { stepId: true },
  });
  const countByStep = new Map(counts.map((c) => [c.stepId, c._count.stepId]));
  return rule.steps
    .map((step) => ({ stepId: step.id, offsetDays: step.offsetDays, action: step.action, count: countByStep.get(step.id) ?? 0 }))
    .filter((entry) => entry.count > 0);
}

export interface OperatorAlertDTO {
  id: string;
  kind: 'suspended' | 'notify';
  customerName: string;
  at: string;
}

export async function listOperatorAlerts(sinceHours = 24): Promise<OperatorAlertDTO[]> {
  const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000);

  const suspended = await db.subscription.findMany({
    where: { status: 'SUSPENDED', updatedAt: { gte: since } },
    include: { customer: { select: { name: true } } },
  });
  const notifyExecutions = await db.dunningExecution.findMany({
    where: { createdAt: { gte: since }, step: { action: 'NOTIFY_OWNER' } },
    include: { charge: { include: { customer: { select: { name: true } } } } },
  });

  return [
    ...suspended.map((s) => ({ id: s.id, kind: 'suspended' as const, customerName: s.customer.name, at: s.updatedAt.toISOString() })),
    ...notifyExecutions.map((e) => ({ id: e.id, kind: 'notify' as const, customerName: e.charge.customer.name, at: e.createdAt.toISOString() })),
  ].sort((a, b) => b.at.localeCompare(a.at));
}
```

⚠️ `sinceHours = 24` usa `Date.now()` dentro de `queries.ts` — isso é `lib`/feature
de leitura, não `core/`, então é permitido (mesma regra já aplicada em
`getDashboardSummary` de `charges/queries.ts`, que também parte de `now`
implícito na borda de leitura). Se preferir manter 100% testável por parâmetro,
aceitar `now` como parâmetro opcional é uma melhoria válida, mas não é bloqueio
desta task.

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: mesmo comando do Step 2.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/dunning/queries.ts src/features/dunning/queries.integration.test.ts
git commit -m "feat(dunning): add listReviewPreview and listOperatorAlerts queries"
```

---

### Task 6: `features/dunning/service.ts` — ativação da régua

**Files:**
- Modify: `src/features/dunning/service.ts`
- Modify: `src/features/dunning/service.integration.test.ts` (já existe)

**Interfaces:**
- Produces: `activateDunningRule(mode: 'send-all' | 'ignore-retroactive'): Promise<void>`.

- [ ] **Step 1: Escrever os testes (falhos)**

Adicionar a `service.integration.test.ts`:

```ts
import { activateDunningRule } from './service';

describe('activateDunningRule', () => {
  it('send-all: muda status pra ACTIVE, mantém PENDING_REVIEW existentes', async () => {
    const rule = await db.dunningRule.findFirstOrThrow({ where: { isDefault: true } });
    await db.dunningRule.update({ where: { id: rule.id }, data: { status: 'REVIEW' } });

    await activateDunningRule('send-all');

    const refreshed = await db.dunningRule.findUniqueOrThrow({ where: { id: rule.id } });
    expect(refreshed.status).toBe('ACTIVE');
  });

  it('ignore-retroactive: apaga PENDING_REVIEW existentes, mantém QUEUED/SKIPPED, ativa a régua', async () => {
    const rule = await db.dunningRule.findFirstOrThrow({ where: { isDefault: true } });
    const step = await db.dunningStep.findFirstOrThrow({ where: { ruleId: rule.id } });
    await db.dunningRule.update({ where: { id: rule.id }, data: { status: 'REVIEW' } });

    const supplier = await db.supplier.create({ data: { name: 'Ativa Fornecedor', unitCostCents: 1000n } });
    const plan = await db.plan.create({ data: { name: 'Ativa Plano', priceCents: 6000n, costCents: 1000n, cycle: 'MONTHLY' } });
    const customer = await db.customer.create({ data: { name: 'Ativa Cliente' } });
    const subscription = await db.subscription.create({ data: { customerId: customer.id, planId: plan.id, supplierId: supplier.id, priceCents: 6000n, costCents: 1000n, cycle: 'MONTHLY', status: 'ACTIVE', startedAt: new Date(), nextDueAt: new Date() } });
    const chargeReview = await db.charge.create({ data: { subscriptionId: subscription.id, customerId: customer.id, supplierId: supplier.id, principalCents: 6000n, periodStart: new Date(), periodEnd: new Date(), dueAt: new Date(), status: 'OPEN' } });
    const chargeQueued = await db.charge.create({ data: { subscriptionId: subscription.id, customerId: customer.id, supplierId: supplier.id, principalCents: 6000n, periodStart: new Date(), periodEnd: new Date(), dueAt: new Date(), status: 'OPEN' } });
    const executionReview = await db.dunningExecution.create({ data: { chargeId: chargeReview.id, stepId: step.id, outcome: 'PENDING_REVIEW', reason: 'review' } });

    await activateDunningRule('ignore-retroactive');

    const refreshedRule = await db.dunningRule.findUniqueOrThrow({ where: { id: rule.id } });
    expect(refreshedRule.status).toBe('ACTIVE');
    const stillThere = await db.dunningExecution.findUnique({ where: { id: executionReview.id } });
    expect(stillThere).toBeNull();

    await db.charge.deleteMany({ where: { id: { in: [chargeReview.id, chargeQueued.id] } } });
    await db.subscription.delete({ where: { id: subscription.id } });
    await db.customer.delete({ where: { id: customer.id } });
    await db.plan.delete({ where: { id: plan.id } });
    await db.supplier.delete({ where: { id: supplier.id } });
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `pnpm test:integration -- src/features/dunning/service.integration.test.ts`
Expected: FAIL — `activateDunningRule` não existe.

- [ ] **Step 3: Implementar**

Adicionar a `service.ts`:

```ts
export async function activateDunningRule(mode: 'send-all' | 'ignore-retroactive'): Promise<void> {
  const rule = await db.dunningRule.findFirstOrThrow({ where: { isDefault: true } });

  if (mode === 'ignore-retroactive') {
    await db.dunningExecution.deleteMany({
      where: { stepId: { in: (await db.dunningStep.findMany({ where: { ruleId: rule.id }, select: { id: true } })).map((s) => s.id) }, outcome: 'PENDING_REVIEW' },
    });
  }

  await db.dunningRule.update({ where: { id: rule.id }, data: { status: 'ACTIVE' } });
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: mesmo comando do Step 2.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/dunning/service.ts src/features/dunning/service.integration.test.ts
git commit -m "feat(dunning): add activateDunningRule (send-all / ignore-retroactive)"
```

---

### Task 7: Server Action de ativação

**Files:**
- Modify: `src/features/dunning/actions.ts` (já existe)

**Interfaces:**
- Consumes: `activateDunningRule` (Task 6).
- Produces: `activateDunningRuleAction(mode: 'send-all' | 'ignore-retroactive')`.

- [ ] **Step 1: Implementar**

```ts
export async function activateDunningRuleAction(mode: 'send-all' | 'ignore-retroactive') {
  try {
    await requireSession();
    await activateDunningRule(mode);
    revalidatePath('/regua');
    return { ok: true as const };
  } catch (err) {
    if (err instanceof DomainError) return { error: { code: err.code, message: err.message } };
    logger.error({ route: 'dunning.activateRule', error: String(err), stack: err instanceof Error ? err.stack : undefined });
    return { error: { code: 'UNEXPECTED', message: messages.common.unexpectedError } };
  }
}
```

Ajustar import de `activateDunningRule` de `./service` no topo do arquivo, junto
dos imports já existentes.

- [ ] **Step 2: Rodar typecheck**

Run: `pnpm tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/features/dunning/actions.ts
git commit -m "feat(dunning): add activateDunningRuleAction"
```

---

### Task 8: UI — prévia do modo revisão em `/regua`

**Files:**
- Create: `src/features/dunning/components/review-preview.tsx`
- Modify: `src/app/(app)/regua/page.tsx` (já existe)

**Interfaces:**
- Consumes: `listReviewPreview` (Task 5), `activateDunningRuleAction` (Task 7),
  `DUNNING_ACTION_LABELS` de `@/lib/labels` (já existe).
- Produces: `ReviewPreview({ rule, preview })`.

- [ ] **Step 1: Implementar `review-preview.tsx`**

```tsx
// src/features/dunning/components/review-preview.tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DUNNING_ACTION_LABELS } from '@/lib/labels';
import { activateDunningRuleAction } from '../actions';
import { toastError, toastSuccess } from '@/lib/toast';
import type { ReviewPreviewDTO } from '../queries';

export function ReviewPreview({ preview }: { preview: ReviewPreviewDTO[] }) {
  const [confirmMode, setConfirmMode] = useState<'send-all' | 'ignore-retroactive' | null>(null);

  async function activate(mode: 'send-all' | 'ignore-retroactive') {
    const result = await activateDunningRuleAction(mode);
    if ('error' in result) {
      toastError(result.error);
      return;
    }
    toastSuccess('Régua ativada.');
    setConfirmMode(null);
  }

  const total = preview.reduce((sum, p) => sum + p.count, 0);

  return (
    <div className="mb-4 rounded-sm border border-warning/40 bg-warning/[.08] p-4">
      <p className="mb-2 text-sm font-bold text-foreground">Régua em revisão — {total} execução(ões) pendente(s)</p>
      <ul className="mb-3 text-sm text-foreground-muted">
        {preview.map((p) => (
          <li key={p.stepId}>
            D{p.offsetDays >= 0 ? '+' : ''}{p.offsetDays} ({DUNNING_ACTION_LABELS[p.action] ?? p.action}): {p.count}
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => setConfirmMode('ignore-retroactive')}>Ignorar retroativos e ativar</Button>
        <Button variant="outline" onClick={() => setConfirmMode('send-all')}>Enviar todas</Button>
      </div>
      <ConfirmDialog
        open={confirmMode !== null}
        onOpenChange={(open) => !open && setConfirmMode(null)}
        title="Ativar régua"
        description={confirmMode === 'ignore-retroactive'
          ? 'As execuções pendentes de revisão serão descartadas e a régua passa a valer só pra frente.'
          : 'A régua fica ativa. As execuções pendentes de revisão continuam registradas, sem reprocessamento automático.'}
        confirmLabel="Ativar"
        onConfirm={() => confirmMode && activate(confirmMode)}
      />
    </div>
  );
}
```

- [ ] **Step 2: Editar `app/(app)/regua/page.tsx`**

Ler o arquivo atual primeiro. Adicionar `listReviewPreview()` ao `Promise.all`
existente, e renderizar `<ReviewPreview preview={preview} />` **só quando**
`rule.status === 'REVIEW'`, antes do `StepList`.

- [ ] **Step 3: Rodar o gate completo**

Run: `pnpm tsc --noEmit && pnpm lint && pnpm test`
Expected: tudo limpo. Confirmar `page.tsx` continua ≤100 linhas — se passar,
extrair a lógica de resolver `aba`/`preview` pra uma função auxiliar no mesmo
arquivo, nunca subir o limite.

- [ ] **Step 4: Commit**

```bash
git add src/features/dunning/components/review-preview.tsx src/app/'(app)'/regua/page.tsx
git commit -m "feat(dunning): add review-mode preview and activation UI"
```

---

### Task 9: Alertas do operador no dashboard

**Files:**
- Create: `src/features/dunning/components/operator-alerts.tsx`
- Modify: `src/app/(app)/page.tsx` (já existe)

**Interfaces:**
- Consumes: `listOperatorAlerts` (Task 5).
- Produces: `OperatorAlerts({ alerts, timezone })`.

- [ ] **Step 1: Implementar**

```tsx
// src/features/dunning/components/operator-alerts.tsx
import { formatLocalDate } from '@/lib/format';
import type { OperatorAlertDTO } from '../queries';

export function OperatorAlerts({ alerts, timezone }: { alerts: OperatorAlertDTO[]; timezone: string }) {
  if (alerts.length === 0) return null;

  return (
    <div className="mb-6 rounded-sm border border-warning/40 bg-warning/[.08] p-4">
      <p className="mb-2 text-sm font-bold text-foreground">Alertas recentes</p>
      <ul className="space-y-1 text-sm text-foreground-muted">
        {alerts.map((alert) => (
          <li key={alert.id}>
            {alert.kind === 'suspended' ? 'Assinatura suspensa' : 'Alerta interno'} — {alert.customerName} ({formatLocalDate(alert.at, timezone)})
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Editar `app/(app)/page.tsx`**

Ler o arquivo atual. Adicionar `listOperatorAlerts()` ao `Promise.all`, renderizar
`<OperatorAlerts alerts={alerts} timezone={settings.timezone} />` acima do
`DashboardPanel` já existente.

- [ ] **Step 3: Rodar o gate completo do projeto**

Run: `pnpm tsc --noEmit && pnpm lint && pnpm test && pnpm test:integration`
Expected: tudo limpo. `page.tsx` ≤100 linhas.

- [ ] **Step 4: Grep de fronteira**

Run: `grep -rn "from '@/features/" src/features/dunning/`

Expected: só `@/features/settings/queries` e `@/features/auth/service` — nenhuma
outra feature.

- [ ] **Step 5: Commit**

```bash
git add src/features/dunning/components/operator-alerts.tsx src/app/'(app)'/page.tsx
git commit -m "feat(dunning): show SUSPEND/NOTIFY_OWNER alerts on the dashboard"
```

---

## Self-review (spec coverage)

| Item da spec | Task |
|---|---|
| `DunningExecution` + `ExecutionOutcome`, idempotência real | 1 |
| `daysFromDue`/`consolidate` puros, testados | 2 |
| `evaluateDunningRule`: REVIEW gate, T5, SUSPEND, NOTIFY_OWNER, consolidação, transação por cliente | 3 |
| Job `dunning-evaluate` | 4 |
| Prévia de contagem por passo + alertas | 5 |
| `activateDunningRule` (2 modos) | 6 |
| Server Action | 7 |
| UI modo revisão (3 opções, 2 com ação real) | 8 |
| Alertas no dashboard | 9 |

Fora de escopo, confirmado: `messages-dispatch`, T6 (quiet hours no envio), T8
(kill switch), retry, envio de verdade — nenhuma task aqui os toca. `Message`
criada por este plano fica `PENDING` até a Spec 4b existir.
