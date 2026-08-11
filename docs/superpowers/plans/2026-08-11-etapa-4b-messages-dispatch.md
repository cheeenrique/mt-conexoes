# Etapa 4b — messages-dispatch (motor de despacho) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o job de cron `messages-dispatch` que envia as `Message` `PENDING` criadas por `dunning-evaluate` (Etapa 4a), respeitando kill switch (T8), quiet hours (T6), reconferência de opt-out (T5) e de pagamento no momento do envio, `stale` (24h) e retry com limite de 3 tentativas.

**Architecture:** Um arquivo de orquestração (`features/messaging/scheduled-dispatch.ts`) processa mensagens `PENDING` uma a uma, fora de transação (chamada HTTP externa nunca dentro de `$transaction`), com update direto por mensagem e `try/catch` isolado por item. Uma função pura nova em `core/dates.ts` calcula o próximo início de janela de quiet hours. Rota de cron casca-fina no padrão de `dunning-evaluate`/`charges-mark-overdue`. DTO e timeline ganham `cancelReason`.

**Tech Stack:** Next.js Route Handler, Prisma, Vitest (unit + integração contra Postgres real).

## Global Constraints

- Dinheiro: não se aplica a este plano — nenhum valor monetário é criado ou lido aqui além do que já vem pronto em `Message.body`.
- Data e fuso: `now` entra por parâmetro em toda função nova, nunca `new Date()` dentro de `core/` ou `service`. Quiet hours e `stale` calculados no fuso de `Settings.timezone`.
- Nenhuma chamada HTTP externa (`adapter.send`) dentro de `db.$transaction`.
- Falha por item (`try/catch`) nunca derruba o lote inteiro — mesmo padrão de `evaluate.ts` e `markOverdueCharges`.
- `if (provider === ...)` fora de `features/messaging/channels` não passa em review — este plano não introduz nenhum.
- Rota de cron: `assertCloudSchedulerToken` primeiro, 401 sem corpo se falhar; `now = new Date()` só na rota, nunca dentro do service.
- Log estruturado (`logger.info`/`warn`/`error`), nunca `console.log`, nunca objeto inteiro — só ids e campos primitivos.
- Nenhum `DomainError` novo neste plano — job de cron não tem usuário síncrono esperando resposta.

---

### Task 1: `nextQuietHourStart` em `core/dates.ts`

**Files:**
- Modify: `src/core/dates.ts`
- Test: `src/core/dates.test.ts`

**Interfaces:**
- Produces: `nextQuietHourStart(now: Date, startHour: number, endHour: number, timezone: string): Date` — usado pela Task 2.

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao final de `src/core/dates.test.ts` (o arquivo já importa `TZDate`/`date-fns` indiretamente via `dates.ts`; adicionar `nextQuietHourStart` ao bloco de import do topo do arquivo, junto dos demais):

```ts
describe('nextQuietHourStart', () => {
  it('antes da janela (07h local): retorna hoje às startHour', () => {
    const now = new Date('2026-08-08T10:00:00Z'); // 07h local
    const result = nextQuietHourStart(now, 8, 20, TZ);
    expect(result.toISOString()).toBe(new Date('2026-08-08T11:00:00Z').toISOString()); // 08h local do mesmo dia
  });

  it('depois da janela (21h local): retorna amanhã às startHour', () => {
    const now = new Date('2026-08-09T00:00:00Z'); // 21h local (08/08)
    const result = nextQuietHourStart(now, 8, 20, TZ);
    expect(result.toISOString()).toBe(new Date('2026-08-09T11:00:00Z').toISOString()); // 08h local de 09/08
  });

  it('exatamente no fim da janela (20h00 local): retorna amanhã às startHour', () => {
    const now = new Date('2026-08-08T23:00:00Z'); // 20h00 local
    const result = nextQuietHourStart(now, 8, 20, TZ);
    expect(result.toISOString()).toBe(new Date('2026-08-09T11:00:00Z').toISOString());
  });

  it('atravessa virada de mês corretamente', () => {
    const now = new Date('2026-09-01T00:00:00Z'); // 21h local de 31/08
    const result = nextQuietHourStart(now, 8, 20, TZ);
    expect(result.toISOString()).toBe(new Date('2026-09-01T11:00:00Z').toISOString()); // 08h local de 01/09
  });
});
```

E adicionar `nextQuietHourStart` ao import existente do topo do arquivo (`import { ..., nextQuietHourStart, ... } from './dates';`).

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test -- dates.test.ts`
Expected: FAIL — `nextQuietHourStart is not a function` (ou erro de import).

- [ ] **Step 3: Implementar**

Em `src/core/dates.ts`, trocar o import do topo:

```ts
import { addDays, addMonths, startOfMonth } from 'date-fns';
```

E adicionar a função, após `isWithinLocalHourRange`:

```ts
/** Próximo instante dentro de [startHour, endHour) no fuso local, a partir de `now`.
 *  Se `now` já está dentro da janela, retorna o início do dia SEGUINTE — T6 só reagenda pra frente,
 *  nunca é chamada com um `now` dentro da janela em uso normal (ver isWithinLocalHourRange no chamador). */
export function nextQuietHourStart(now: Date, startHour: number, endHour: number, timezone: string): Date {
  const local = new TZDate(now, timezone);
  const hourFraction = local.getHours() + local.getMinutes() / 60;
  const base = hourFraction < startHour ? local : addDays(local, 1);
  const target = new TZDate(base.getFullYear(), base.getMonth(), base.getDate(), startHour, 0, 0, 0, timezone);
  return new Date(target.getTime());
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test -- dates.test.ts`
Expected: PASS, todos os testes do arquivo (incluindo os pré-existentes).

- [ ] **Step 5: Commit**

```bash
git add src/core/dates.ts src/core/dates.test.ts
git commit -m "feat(core): add nextQuietHourStart for T6 message rescheduling"
```

---

### Task 2: `scheduled-dispatch.ts` — motor do despacho

**Files:**
- Create: `src/features/messaging/scheduled-dispatch.ts`
- Test: `src/features/messaging/scheduled-dispatch.integration.test.ts`

**Interfaces:**
- Consumes: `nextQuietHourStart`, `isWithinLocalHourRange` de `@/core/dates` (Task 1 e já existente); `resolveAdapter` de `./channels/registry`; `decrypt` de `@/lib/crypto`; `logger` de `@/lib/logger`; `db` de `@/lib/db`.
- Produces: `export type DispatchResult = { sent: number; failed: number; cancelledStale: number; cancelledOptedOut: number; cancelledPaid: number; rescheduled: number }` e `export async function dispatchPendingMessages(now: Date): Promise<DispatchResult>` — consumidos pela Task 3.

- [ ] **Step 1: Escrever os testes de integração que falham**

Criar `src/features/messaging/scheduled-dispatch.integration.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { encrypt } from '@/lib/crypto';
import { dispatchPendingMessages } from './scheduled-dispatch';

process.env.CREDENTIAL_KEY = process.env.CREDENTIAL_KEY ?? Buffer.alloc(32, 9).toString('base64');

const IN_HOURS_NOW = new Date('2026-08-08T15:00:00Z'); // 12h em America/Sao_Paulo, dentro de 8-20
const OUT_OF_HOURS_NOW = new Date('2026-08-09T02:00:00Z'); // 23h local (08/08), fora de 8-20

async function seedActiveDefaultChannel() {
  return db.channelConfig.create({
    data: {
      provider: 'EVOLUTION',
      label: 'Evolution API',
      isActive: true,
      isDefault: true,
      credentials: encrypt(
        JSON.stringify({ baseUrl: 'https://evolution.example.com', apiKey: 'a', instanceName: 'default', webhookToken: 'webhook-token-teste' }),
        'channel.credentials',
      ),
      lastCheckOk: true,
    },
  });
}

async function seedCustomer(overrides: { optedOut?: boolean } = {}) {
  return db.customer.create({
    data: { name: 'Dispatch Teste', phone: '+5511998880000', optedOut: overrides.optedOut ?? false },
  });
}

async function seedPendingMessage(
  customerId: string,
  overrides: { createdAt?: Date; scheduledFor?: Date; attempts?: number } = {},
) {
  return db.message.create({
    data: {
      customerId,
      kind: 'DUNNING',
      status: 'PENDING',
      toPhone: '+5511998880000',
      body: 'Olá! Sua cobrança venceu.',
      scheduledFor: overrides.scheduledFor ?? IN_HOURS_NOW,
      scheduledDate: new Date('2026-08-08'),
      createdAt: overrides.createdAt ?? IN_HOURS_NOW,
      attempts: overrides.attempts ?? 0,
    },
  });
}

/** Cria fornecedor+plano+assinatura+cobrança com o status dado, ligada à Message via DunningExecution.
 *  `seq` mantém nome de fornecedor/plano único entre chamadas na mesma suíte. */
async function seedChargeWithExecution(customerId: string, messageId: string, status: 'OPEN' | 'PAID' | 'CANCELLED', seq: number) {
  const supplier = await db.supplier.create({ data: { name: `Fornecedor Dispatch ${seq}`, unitCostCents: 1000n } });
  const plan = await db.plan.create({ data: { name: `Plano Dispatch ${seq}`, priceCents: 6000n, costCents: 1000n, cycle: 'MONTHLY' } });
  const subscription = await db.subscription.create({
    data: {
      customerId, planId: plan.id, supplierId: supplier.id,
      priceCents: 6000n, costCents: 1000n, cycle: 'MONTHLY', status: 'ACTIVE',
      startedAt: IN_HOURS_NOW, nextDueAt: IN_HOURS_NOW,
    },
  });
  const charge = await db.charge.create({
    data: {
      subscriptionId: subscription.id, customerId, supplierId: supplier.id,
      principalCents: 6000n, periodStart: IN_HOURS_NOW, periodEnd: IN_HOURS_NOW, dueAt: IN_HOURS_NOW, status,
    },
  });
  const step = await db.dunningStep.findFirstOrThrow({ where: { rule: { isDefault: true } } });
  await db.dunningExecution.create({ data: { chargeId: charge.id, stepId: step.id, outcome: 'QUEUED', messageId } });
  return charge;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await db.dunningExecution.deleteMany({ where: { charge: { customer: { name: 'Dispatch Teste' } } } });
  await db.message.deleteMany({ where: { customer: { name: 'Dispatch Teste' } } });
  await db.charge.deleteMany({ where: { customer: { name: 'Dispatch Teste' } } });
  await db.subscription.deleteMany({ where: { customer: { name: 'Dispatch Teste' } } });
  await db.customer.deleteMany({ where: { name: 'Dispatch Teste' } });
  await db.plan.deleteMany({ where: { name: { startsWith: 'Plano Dispatch' } } });
  await db.supplier.deleteMany({ where: { name: { startsWith: 'Fornecedor Dispatch' } } });
  await db.channelConfig.deleteMany({ where: { provider: 'EVOLUTION' } });
  await db.settings.update({ where: { id: 'singleton' }, data: { sendingPaused: false } });
});

describe('dispatchPendingMessages', () => {
  it('kill switch pausado: nenhuma Message tocada, contadores zero (T8)', async () => {
    await seedActiveDefaultChannel();
    const customer = await seedCustomer();
    const msg = await seedPendingMessage(customer.id, { createdAt: new Date('2026-08-01T12:00:00Z') }); // seria stale, mas pausado não toca em nada
    await db.settings.update({ where: { id: 'singleton' }, data: { sendingPaused: true } });

    const result = await dispatchPendingMessages(IN_HOURS_NOW);

    expect(result).toEqual({ sent: 0, failed: 0, cancelledStale: 0, cancelledOptedOut: 0, cancelledPaid: 0, rescheduled: 0 });
    const reloaded = await db.message.findUnique({ where: { id: msg.id } });
    expect(reloaded?.status).toBe('PENDING');
  });

  it('sem canal padrão ativo: nenhuma Message tocada, sem lançar', async () => {
    const customer = await seedCustomer();
    const msg = await seedPendingMessage(customer.id);

    const result = await dispatchPendingMessages(IN_HOURS_NOW);

    expect(result.sent).toBe(0);
    const reloaded = await db.message.findUnique({ where: { id: msg.id } });
    expect(reloaded?.status).toBe('PENDING');
  });

  it('mensagem com mais de 24h de idade vira CANCELLED, motivo stale', async () => {
    await seedActiveDefaultChannel();
    const customer = await seedCustomer();
    const msg = await seedPendingMessage(customer.id, { createdAt: new Date('2026-08-06T12:00:00Z') }); // >24h antes de IN_HOURS_NOW

    const result = await dispatchPendingMessages(IN_HOURS_NOW);

    expect(result.cancelledStale).toBe(1);
    const reloaded = await db.message.findUnique({ where: { id: msg.id } });
    expect(reloaded?.status).toBe('CANCELLED');
    expect(reloaded?.cancelReason).toBe('stale');
  });

  it('mensagem fora da quiet hour é reagendada pro início da próxima janela, não descartada (T6)', async () => {
    await seedActiveDefaultChannel();
    const customer = await seedCustomer();
    const msg = await seedPendingMessage(customer.id, { createdAt: OUT_OF_HOURS_NOW, scheduledFor: OUT_OF_HOURS_NOW });

    const result = await dispatchPendingMessages(OUT_OF_HOURS_NOW);

    expect(result.rescheduled).toBe(1);
    const reloaded = await db.message.findUnique({ where: { id: msg.id } });
    expect(reloaded?.status).toBe('PENDING');
    expect(reloaded?.scheduledFor.toISOString()).toBe(new Date('2026-08-09T11:00:00Z').toISOString()); // 08h local do dia seguinte
  });

  it('customer.optedOut cancela o envio, motivo opted_out (T5)', async () => {
    await seedActiveDefaultChannel();
    const customer = await seedCustomer({ optedOut: true });
    const msg = await seedPendingMessage(customer.id);

    const result = await dispatchPendingMessages(IN_HOURS_NOW);

    expect(result.cancelledOptedOut).toBe(1);
    const reloaded = await db.message.findUnique({ where: { id: msg.id } });
    expect(reloaded?.status).toBe('CANCELLED');
    expect(reloaded?.cancelReason).toBe('opted_out');
  });

  it('mensagem com única cobrança ligada já paga é cancelada, motivo payment_received', async () => {
    await seedActiveDefaultChannel();
    const customer = await seedCustomer();
    const msg = await seedPendingMessage(customer.id);
    await seedChargeWithExecution(customer.id, msg.id, 'PAID', 1);

    const result = await dispatchPendingMessages(IN_HOURS_NOW);

    expect(result.cancelledPaid).toBe(1);
    const reloaded = await db.message.findUnique({ where: { id: msg.id } });
    expect(reloaded?.status).toBe('CANCELLED');
    expect(reloaded?.cancelReason).toBe('payment_received');
  });

  it('mensagem consolidada com uma cobrança paga e outra ainda aberta NÃO cancela, tenta enviar', async () => {
    await seedActiveDefaultChannel();
    const customer = await seedCustomer();
    const msg = await seedPendingMessage(customer.id);
    await seedChargeWithExecution(customer.id, msg.id, 'PAID', 2);
    await seedChargeWithExecution(customer.id, msg.id, 'OPEN', 3);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ key: { id: 'wamid1' } }) }));

    const result = await dispatchPendingMessages(IN_HOURS_NOW);

    expect(result.cancelledPaid).toBe(0);
    expect(result.sent).toBe(1);
  });

  it('envio com sucesso: SENT, sentAt, externalId e channelId gravados', async () => {
    const channel = await seedActiveDefaultChannel();
    const customer = await seedCustomer();
    const msg = await seedPendingMessage(customer.id);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ key: { id: 'wamid-ok' } }) }));

    const result = await dispatchPendingMessages(IN_HOURS_NOW);

    expect(result.sent).toBe(1);
    const reloaded = await db.message.findUnique({ where: { id: msg.id } });
    expect(reloaded?.status).toBe('SENT');
    expect(reloaded?.externalId).toBe('wamid-ok');
    expect(reloaded?.channelId).toBe(channel.id);
    expect(reloaded?.sentAt).not.toBeNull();
  });

  it('falha retryable incrementa attempts; na terceira tentativa vira FAILED', async () => {
    await seedActiveDefaultChannel();
    const customer = await seedCustomer();
    const msg = await seedPendingMessage(customer.id, { attempts: 2 });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ message: 'fora do ar' }) }));

    const result = await dispatchPendingMessages(IN_HOURS_NOW);

    expect(result.failed).toBe(1);
    const reloaded = await db.message.findUnique({ where: { id: msg.id } });
    expect(reloaded?.status).toBe('FAILED');
    expect(reloaded?.attempts).toBe(3);
    expect(reloaded?.failReason).toBe('fora do ar');
  });

  it('falha retryable antes da terceira tentativa mantém PENDING pra próxima passada', async () => {
    await seedActiveDefaultChannel();
    const customer = await seedCustomer();
    const msg = await seedPendingMessage(customer.id, { attempts: 0 });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ message: 'fora do ar' }) }));

    const result = await dispatchPendingMessages(IN_HOURS_NOW);

    expect(result.failed).toBe(0);
    expect(result.sent).toBe(0);
    const reloaded = await db.message.findUnique({ where: { id: msg.id } });
    expect(reloaded?.status).toBe('PENDING');
    expect(reloaded?.attempts).toBe(1);
  });

  it('falha não-retryable vira FAILED na primeira tentativa, sem gastar as 3 rodadas', async () => {
    await seedActiveDefaultChannel();
    const customer = await seedCustomer();
    const msg = await seedPendingMessage(customer.id, { attempts: 0 });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ message: 'número inválido' }) }));

    const result = await dispatchPendingMessages(IN_HOURS_NOW);

    expect(result.failed).toBe(1);
    const reloaded = await db.message.findUnique({ where: { id: msg.id } });
    expect(reloaded?.status).toBe('FAILED');
    expect(reloaded?.attempts).toBe(1);
  });

  it('respeita o lote de 60 e a ordem de criação', async () => {
    await seedActiveDefaultChannel();
    const customer = await seedCustomer();
    for (let i = 0; i < 65; i++) {
      await seedPendingMessage(customer.id, { createdAt: new Date(IN_HOURS_NOW.getTime() + i * 1000) });
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ key: { id: 'wamid-batch' } }) }));

    const result = await dispatchPendingMessages(IN_HOURS_NOW);

    expect(result.sent).toBe(60);
    const stillPending = await db.message.count({ where: { customerId: customer.id, status: 'PENDING' } });
    expect(stillPending).toBe(5);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test:integration -- scheduled-dispatch.integration.test.ts`
Expected: FAIL — `Cannot find module './scheduled-dispatch'`.

- [ ] **Step 3: Implementar**

Criar `src/features/messaging/scheduled-dispatch.ts`:

```ts
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { decrypt } from '@/lib/crypto';
import { isWithinLocalHourRange, nextQuietHourStart } from '@/core/dates';
import { resolveAdapter } from './channels/registry';
import type { ChannelAdapter } from './channels/types';
import { logger } from '@/lib/logger';

export type DispatchResult = {
  sent: number;
  failed: number;
  cancelledStale: number;
  cancelledOptedOut: number;
  cancelledPaid: number;
  rescheduled: number;
};

function emptyResult(): DispatchResult {
  return { sent: 0, failed: 0, cancelledStale: 0, cancelledOptedOut: 0, cancelledPaid: 0, rescheduled: 0 };
}

const BATCH_SIZE = 60;
const STALE_MS = 24 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const OPEN_CHARGE_STATUSES = new Set(['OPEN', 'OVERDUE', 'PARTIALLY_PAID']);

type PendingMessage = Prisma.MessageGetPayload<{ include: { customer: { select: { optedOut: true } } } }>;

/** Todas as cobranças ligadas a esta Message (via DunningExecution) já foram pagas/canceladas?
 *  Sem nenhuma ligação (mensagem manual, ou dado inconsistente), não cancela — segue pro envio. */
async function isFullyPaidOrCancelled(messageId: string): Promise<boolean> {
  const executions = await db.dunningExecution.findMany({
    where: { messageId },
    select: { charge: { select: { status: true } } },
  });
  if (executions.length === 0) return false;
  return executions.every((e) => !OPEN_CHARGE_STATUSES.has(e.charge.status));
}

type Outcome = keyof DispatchResult | 'none';

async function processMessage(
  msg: PendingMessage,
  now: Date,
  settings: { quietHourStart: number; quietHourEnd: number; timezone: string },
  channelId: string,
  credentials: unknown,
  adapter: ChannelAdapter,
): Promise<Outcome> {
  if (now.getTime() - msg.createdAt.getTime() > STALE_MS) {
    await db.message.update({ where: { id: msg.id }, data: { status: 'CANCELLED', cancelReason: 'stale' } });
    return 'cancelledStale';
  }

  if (!isWithinLocalHourRange(now, settings.quietHourStart, settings.quietHourEnd, settings.timezone)) {
    const scheduledFor = nextQuietHourStart(now, settings.quietHourStart, settings.quietHourEnd, settings.timezone);
    await db.message.update({ where: { id: msg.id }, data: { scheduledFor } });
    return 'rescheduled';
  }

  if (msg.customer.optedOut) {
    await db.message.update({ where: { id: msg.id }, data: { status: 'CANCELLED', cancelReason: 'opted_out' } });
    return 'cancelledOptedOut';
  }

  if (await isFullyPaidOrCancelled(msg.id)) {
    await db.message.update({ where: { id: msg.id }, data: { status: 'CANCELLED', cancelReason: 'payment_received' } });
    return 'cancelledPaid';
  }

  const result = await adapter.send({ toPhone: msg.toPhone, body: msg.body }, credentials);
  const attempts = msg.attempts + 1;

  if (result.ok) {
    await db.message.update({
      where: { id: msg.id },
      data: { status: 'SENT', sentAt: now, externalId: result.externalId, channelId, attempts },
    });
    return 'sent';
  }

  if (!result.retryable || attempts >= MAX_ATTEMPTS) {
    await db.message.update({
      where: { id: msg.id },
      data: { status: 'FAILED', failReason: result.reason, attempts, channelId },
    });
    return 'failed';
  }

  await db.message.update({ where: { id: msg.id }, data: { attempts } });
  return 'none';
}

export async function dispatchPendingMessages(now: Date): Promise<DispatchResult> {
  const settings = await db.settings.findUniqueOrThrow({ where: { id: 'singleton' } });
  if (settings.sendingPaused) return emptyResult();

  const channelRow = await db.channelConfig.findFirst({ where: { isDefault: true, isActive: true } });
  if (!channelRow) {
    logger.warn({ job: 'messages-dispatch', reason: 'no_default_channel' });
    return emptyResult();
  }

  const adapter = resolveAdapter(channelRow.provider);
  const credentials = JSON.parse(decrypt(channelRow.credentials, 'channel.credentials'));

  const messages = await db.message.findMany({
    where: { status: 'PENDING', scheduledFor: { lte: now } },
    orderBy: { createdAt: 'asc' },
    take: BATCH_SIZE,
    include: { customer: { select: { optedOut: true } } },
  });

  const result = emptyResult();

  for (const msg of messages) {
    try {
      const outcome = await processMessage(msg, now, settings, channelRow.id, credentials, adapter);
      if (outcome !== 'none') result[outcome]++;
    } catch (err) {
      logger.error({ job: 'messages-dispatch', messageId: msg.id, error: String(err) });
    }
  }

  return result;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test:integration -- scheduled-dispatch.integration.test.ts`
Expected: PASS, todos os 12 testes.

- [ ] **Step 5: Commit**

```bash
git add src/features/messaging/scheduled-dispatch.ts src/features/messaging/scheduled-dispatch.integration.test.ts
git commit -m "feat(messaging): add messages-dispatch engine (T5/T6/T8, stale, retry)"
```

---

### Task 3: Rota de cron `messages-dispatch`

**Files:**
- Create: `src/app/api/cron/messages-dispatch/route.ts`
- Test: `src/app/api/cron/messages-dispatch/route.integration.test.ts`

**Interfaces:**
- Consumes: `dispatchPendingMessages` da Task 2; `assertCloudSchedulerToken` de `@/lib/cron-auth` (já existe).

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/app/api/cron/messages-dispatch/route.integration.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { POST } from './route';

describe('POST /api/cron/messages-dispatch', () => {
  it('sem token válido devolve 401', async () => {
    const req = new Request('http://localhost/api/cron/messages-dispatch', { method: 'POST' });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('com token válido roda e devolve o resumo', async () => {
    process.env.CRON_SECRET = process.env.CRON_SECRET ?? 'dev-cron-secret';
    const req = new Request('http://localhost/api/cron/messages-dispatch', {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('sent');
    expect(body).toHaveProperty('failed');
    expect(body).toHaveProperty('cancelledStale');
    expect(body).toHaveProperty('cancelledOptedOut');
    expect(body).toHaveProperty('cancelledPaid');
    expect(body).toHaveProperty('rescheduled');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test:integration -- messages-dispatch/route.integration.test.ts`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Implementar**

Criar `src/app/api/cron/messages-dispatch/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { assertCloudSchedulerToken } from '@/lib/cron-auth';
import { dispatchPendingMessages } from '@/features/messaging/scheduled-dispatch';
import { logger } from '@/lib/logger';

export async function POST(req: Request) {
  try {
    await assertCloudSchedulerToken(req);
  } catch {
    return new NextResponse(null, { status: 401 });
  }

  const result = await dispatchPendingMessages(new Date());
  logger.info({ job: 'messages-dispatch', ...result });
  return NextResponse.json(result);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test:integration -- messages-dispatch/route.integration.test.ts`
Expected: PASS, 2 testes.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cron/messages-dispatch/route.ts src/app/api/cron/messages-dispatch/route.integration.test.ts
git commit -m "feat(cron): add messages-dispatch route"
```

---

### Task 4: `cancelReason` na timeline do cliente

**Files:**
- Modify: `src/features/messaging/queries.ts`
- Modify: `src/features/messaging/components/message-timeline.tsx`
- Test: `src/features/messaging/queries.integration.test.ts`
- Test: `src/features/messaging/components/message-timeline.test.tsx` (novo)

**Interfaces:**
- Consumes: nenhuma nova (schema já tem `Message.cancelReason`, sem migration).
- Produces: `MessageDTO.cancelReason: string | null` — consumido por `MessageTimeline`.

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao final de `describe('listMessagesForCustomer', ...)` em `src/features/messaging/queries.integration.test.ts`:

```ts
  it('inclui cancelReason quando a mensagem foi cancelada', async () => {
    const customer = await db.customer.create({ data: { name: 'Timeline Teste', phone: '+5511999990003' } });
    await db.message.create({
      data: {
        customerId: customer.id, kind: 'DUNNING', status: 'CANCELLED', cancelReason: 'stale',
        toPhone: customer.phone!, body: 'Oi', scheduledFor: new Date(), scheduledDate: new Date(),
      },
    });

    const rows = await listMessagesForCustomer(customer.id);

    expect(rows[0].cancelReason).toBe('stale');
  });
```

(A limpeza de `Timeline Teste` já existe em `afterEach` deste arquivo — confirmar antes de adicionar; se não existir, adicionar `await db.message.deleteMany(...)` e `await db.customer.deleteMany({ where: { name: 'Timeline Teste' } })` ao `afterEach`.)

Criar `src/features/messaging/components/message-timeline.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MessageTimeline } from './message-timeline';
import type { MessageDTO } from '../queries';

const TZ = 'America/Sao_Paulo';

function makeMessage(overrides: Partial<MessageDTO> = {}): MessageDTO {
  return {
    id: '1', kind: 'DUNNING', status: 'CANCELLED', body: 'Sua cobrança venceu.',
    sentAt: null, failReason: null, cancelReason: null, createdAt: '2026-08-08T12:00:00Z',
    ...overrides,
  };
}

describe('MessageTimeline', () => {
  it('mostra o motivo do cancelamento traduzido', () => {
    render(<MessageTimeline messages={[makeMessage({ cancelReason: 'stale' })]} timezone={TZ} />);
    expect(screen.getByText(/mensagem parada há mais de 24h/i)).toBeInTheDocument();
  });

  it('sem cancelReason não mostra linha de cancelamento', () => {
    render(<MessageTimeline messages={[makeMessage({ status: 'SENT', cancelReason: null })]} timezone={TZ} />);
    expect(screen.queryByText(/Cancelada:/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test:integration -- queries.integration.test.ts && pnpm test -- message-timeline.test.tsx`
Expected: FAIL — `cancelReason` undefined na query; `MessageTimeline` não renderiza motivo (teste do componente falha por `getByText` não encontrar).

- [ ] **Step 3: Implementar**

Em `src/features/messaging/queries.ts`, adicionar `cancelReason` à interface e ao mapeamento:

```ts
export interface MessageDTO {
  id: string;
  kind: string;
  status: string;
  body: string;
  sentAt: string | null;
  failReason: string | null;
  cancelReason: string | null;
  createdAt: string;
}
```

E no `return rows.map(...)` de `listMessagesForCustomer`, adicionar a linha `cancelReason: row.cancelReason,` (mesmo padrão de `failReason: row.failReason,`).

Em `src/features/messaging/components/message-timeline.tsx`, adicionar o mapa e a renderização:

```tsx
const CANCEL_REASON_LABEL: Record<string, string> = {
  stale: 'mensagem parada há mais de 24h',
  opted_out: 'cliente pediu pra sair',
  payment_received: 'cobrança já paga',
};
```

E logo abaixo da linha `{msg.failReason && <p className="mt-1 text-xs text-danger">{msg.failReason}</p>}`:

```tsx
{msg.cancelReason && (
  <p className="mt-1 text-xs text-danger">
    Cancelada: {CANCEL_REASON_LABEL[msg.cancelReason] ?? msg.cancelReason}
  </p>
)}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test:integration -- queries.integration.test.ts && pnpm test -- message-timeline.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/messaging/queries.ts src/features/messaging/queries.integration.test.ts src/features/messaging/components/message-timeline.tsx src/features/messaging/components/message-timeline.test.tsx
git commit -m "feat(messaging): show cancelReason in customer timeline"
```
