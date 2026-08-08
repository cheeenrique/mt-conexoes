import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { markOverdueCharges, POST } from './route';

let customerId: string;
let subscriptionIds: string[];

beforeEach(async () => {
  const customer = await db.customer.create({ data: { name: `Cliente Overdue ${randomUUID()}` } });
  customerId = customer.id;
  subscriptionIds = [];
});

afterEach(async () => {
  await db.payment.deleteMany({ where: { charge: { subscriptionId: { in: subscriptionIds } } } });
  await db.charge.deleteMany({ where: { subscriptionId: { in: subscriptionIds } } });
  await db.subscription.deleteMany({ where: { id: { in: subscriptionIds } } });
  await db.customer.deleteMany({ where: { id: customerId } });
});

// Índice único parcial (subscriptionId) permite no máximo uma Charge
// OPEN/OVERDUE/PARTIALLY_PAID por assinatura — cada cenário de charge "em
// aberto" precisa da sua própria Subscription.
async function createChargeOnNewSubscription(overrides: Partial<Prisma.ChargeUncheckedCreateInput> = {}) {
  const subscription = await db.subscription.create({
    data: {
      customerId,
      priceCents: 10000n,
      costCents: 3000n,
      cycle: 'MONTHLY',
      nextDueAt: new Date('2026-08-31T23:59:59.000Z'),
    },
  });
  subscriptionIds.push(subscription.id);

  return db.charge.create({
    data: {
      subscriptionId: subscription.id,
      customerId,
      principalCents: 10000n,
      discountCents: 0n,
      costCents: 3000n,
      periodStart: new Date('2026-06-30T00:00:00.000Z'),
      periodEnd: new Date('2026-07-31T00:00:00.000Z'),
      dueAt: new Date('2026-07-31T23:59:59.000Z'),
      status: 'OPEN',
      ...overrides,
    },
  });
}

describe('markOverdueCharges', () => {
  it('rebaixa OPEN vencida para OVERDUE e mantém PARTIALLY_PAID vencida como OVERDUE', async () => {
    const open = await createChargeOnNewSubscription({ status: 'OPEN' });
    const partiallyPaid = await createChargeOnNewSubscription({ status: 'PARTIALLY_PAID' });
    await db.payment.create({
      data: {
        chargeId: partiallyPaid.id,
        amountCents: 4000n,
        method: 'PIX',
        paidAt: new Date('2026-07-15T00:00:00.000Z'),
        idempotencyKey: randomUUID(),
      },
    });

    const now = new Date('2026-08-01T00:00:00.000Z');
    const result = await markOverdueCharges(now);

    expect(result.updated).toBe(2);
    expect(result.failed).toBe(0);

    const openAfter = await db.charge.findUniqueOrThrow({ where: { id: open.id } });
    expect(openAfter.status).toBe('OVERDUE');

    const partiallyPaidAfter = await db.charge.findUniqueOrThrow({ where: { id: partiallyPaid.id } });
    expect(partiallyPaidAfter.status).toBe('OVERDUE');
  });

  it('não mexe em Charge ainda não vencida', async () => {
    const future = await createChargeOnNewSubscription({
      status: 'OPEN',
      dueAt: new Date('2026-12-31T23:59:59.000Z'),
    });

    const now = new Date('2026-08-01T00:00:00.000Z');
    const result = await markOverdueCharges(now);

    expect(result.updated).toBe(0);

    const futureAfter = await db.charge.findUniqueOrThrow({ where: { id: future.id } });
    expect(futureAfter.status).toBe('OPEN');
  });

  it('rodar duas vezes seguidas dá o mesmo resultado (idempotente)', async () => {
    const charge = await createChargeOnNewSubscription({ status: 'OPEN' });

    const now = new Date('2026-08-01T00:00:00.000Z');
    const first = await markOverdueCharges(now);
    const second = await markOverdueCharges(now);

    expect(first.updated).toBe(1);
    expect(second.updated).toBe(0);

    const chargeAfter = await db.charge.findUniqueOrThrow({ where: { id: charge.id } });
    expect(chargeAfter.status).toBe('OVERDUE');
  });
});

describe('POST /api/cron/charges-mark-overdue', () => {
  it('sem token válido devolve 401', async () => {
    const req = new Request('http://localhost/api/cron/charges-mark-overdue', { method: 'POST' });

    const res = await POST(req);

    expect(res.status).toBe(401);
  });
});
