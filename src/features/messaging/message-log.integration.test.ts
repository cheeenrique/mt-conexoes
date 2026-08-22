import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { listMessages } from './queries';

const TAG = 'msglog';
const PHONE = '+5511999998877';

let customerId: string;
let chargeId: string;
let stepId: string;
let ruleId: string;

/** Apaga resíduo de uma passada anterior que morreu no meio: teste tem que rodar duas vezes seguidas. */
async function purge() {
  const existing = await db.customer.findMany({ where: { phone: PHONE }, select: { id: true } });
  const ids = existing.map((c) => c.id);
  if (ids.length) {
    const charges = await db.charge.findMany({ where: { customerId: { in: ids } }, select: { id: true } });
    await db.dunningExecution.deleteMany({ where: { chargeId: { in: charges.map((c) => c.id) } } });
    await db.message.deleteMany({ where: { customerId: { in: ids } } });
    await db.charge.deleteMany({ where: { customerId: { in: ids } } });
    await db.subscription.deleteMany({ where: { customerId: { in: ids } } });
    await db.customer.deleteMany({ where: { id: { in: ids } } });
  }
  const rules = await db.dunningRule.findMany({ where: { name: `${TAG} Régua` }, select: { id: true } });
  if (rules.length) {
    await db.dunningStep.deleteMany({ where: { ruleId: { in: rules.map((r) => r.id) } } });
    await db.dunningRule.deleteMany({ where: { id: { in: rules.map((r) => r.id) } } });
  }
}

async function seed() {
  const customer = await db.customer.create({
    data: { name: `${TAG} Cliente`, phone: PHONE },
  });
  customerId = customer.id;

  const subscription = await db.subscription.create({
    data: { customerId, priceCents: 5000n, cycle: 'MONTHLY', nextDueAt: new Date('2026-09-08T02:59:59.999Z') },
  });

  const charge = await db.charge.create({
    data: {
      subscriptionId: subscription.id,
      customerId,
      principalCents: 5000n,
      periodStart: new Date('2026-08-01T00:00:00.000Z'),
      periodEnd: new Date('2026-08-31T00:00:00.000Z'),
      dueAt: new Date('2026-08-09T02:59:59.999Z'),
      status: 'OVERDUE',
    },
  });
  chargeId = charge.id;

  const rule = await db.dunningRule.create({ data: { name: `${TAG} Régua`, status: 'ACTIVE' } });
  ruleId = rule.id;
  const step = await db.dunningStep.create({ data: { ruleId, offsetDays: 1, templateBody: 'Olá' } });
  stepId = step.id;
}

beforeAll(async () => {
  await purge();
  await seed();
});

afterAll(purge);

afterEach(async () => {
  await db.dunningExecution.deleteMany({ where: { chargeId } });
  await db.message.deleteMany({ where: { customerId } });
});

function ours<T extends { customerId: string }>(entries: T[]): T[] {
  return entries.filter((e) => e.customerId === customerId);
}

async function createMessage(data: Partial<Parameters<typeof db.message.create>[0]['data']> = {}) {
  return db.message.create({
    data: {
      customerId,
      kind: 'DUNNING',
      status: 'SENT',
      toPhone: PHONE,
      body: 'Olá! Sua renovação venceu ontem.',
      scheduledFor: new Date('2026-08-08T12:00:00.000Z'),
      scheduledDate: new Date('2026-08-08T00:00:00.000Z'),
      sentAt: new Date('2026-08-08T12:03:00.000Z'),
      ...data,
    } as Parameters<typeof db.message.create>[0]['data'],
  });
}

describe('listMessages', () => {
  it('junta a mensagem enviada com o pulo que nunca virou mensagem', async () => {
    const message = await createMessage();
    await db.dunningExecution.create({
      data: { chargeId, stepId, outcome: 'QUEUED', messageId: message.id },
    });
    // Pulo antes de virar mensagem: só existe em dunning_executions, sem messageId.
    const otherStep = await db.dunningStep.create({ data: { ruleId, offsetDays: 3 } });
    await db.dunningExecution.create({
      data: { chargeId, stepId: otherStep.id, outcome: 'SKIPPED', reason: 'opted_out' },
    });

    const { entries } = await listMessages();
    const mine = ours(entries);

    expect(mine).toHaveLength(2);
    const skipped = mine.find((e) => e.source === 'EXECUTION');
    expect(skipped?.outcome).toBe('SKIPPED');
    expect(skipped?.reasonCode).toBe('opted_out');
    expect(skipped?.stepLabel).toBe('D+3');
    // A régua parou antes de montar o texto — inventar corpo aqui seria mentira.
    expect(skipped?.body).toBeNull();

    await db.dunningStep.delete({ where: { id: otherStep.id } });
  });

  it('não duplica a linha quando a execution já aponta para uma mensagem', async () => {
    const message = await createMessage();
    await db.dunningExecution.create({ data: { chargeId, stepId, outcome: 'QUEUED', messageId: message.id } });

    const mine = ours((await listMessages()).entries);

    expect(mine).toHaveLength(1);
    expect(mine[0].source).toBe('MESSAGE');
    expect(mine[0].stepLabel).toBe('D+1');
  });

  it('mostra a mensagem cancelada no despacho como pulada, com o motivo do job', async () => {
    await createMessage({ status: 'CANCELLED', cancelReason: 'charge_closed', sentAt: null });

    const mine = ours((await listMessages()).entries);

    expect(mine[0].outcome).toBe('SKIPPED');
    expect(mine[0].reasonCode).toBe('charge_closed');
  });

  it('distingue adiada de na fila pelo scheduledFor empurrado pela quiet hour', async () => {
    const created = await createMessage({ status: 'PENDING', sentAt: null });
    await db.message.update({
      where: { id: created.id },
      data: { scheduledFor: new Date(created.createdAt.getTime() + 11 * 60 * 60 * 1000) },
    });

    const mine = ours((await listMessages()).entries);

    expect(mine[0].outcome).toBe('PENDING');
    expect(mine[0].postponed).toBe(true);
    expect(mine[0].postponedToAt).not.toBeNull();
  });

  it('deixa de fora a mensagem recebida — a tela prova envio, não conversa', async () => {
    await createMessage({ kind: 'INBOUND', status: 'RECEIVED', sentAt: null });

    expect(ours((await listMessages()).entries)).toHaveLength(0);
  });

  it('recorta o período pelo envio efetivo, não pela criação', async () => {
    // Criada 08/08 23h50 local, despachada 09/08 08h10 local: pertence ao dia 09.
    await createMessage({
      createdAt: new Date('2026-08-09T02:50:00.000Z'),
      sentAt: new Date('2026-08-09T11:10:00.000Z'),
    });

    const dayNine = await listMessages({
      from: new Date('2026-08-09T03:00:00.000Z'),
      to: new Date('2026-08-10T02:59:59.999Z'),
    });
    const dayEight = await listMessages({
      from: new Date('2026-08-08T03:00:00.000Z'),
      to: new Date('2026-08-09T02:59:59.999Z'),
    });

    expect(ours(dayNine.entries)).toHaveLength(1);
    expect(ours(dayEight.entries)).toHaveLength(0);
  });
});
