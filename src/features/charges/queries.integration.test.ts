import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { getDueDateOverview } from './queries';

const TZ = 'America/Sao_Paulo';
const NOW = new Date('2026-08-15T15:00:00.000Z');

let customerId: string;
let periodOffset: number;

async function createCharge(dueAt: Date, opts: { principalCents?: bigint; status?: string; paidCents?: bigint } = {}) {
  // Each charge gets its own subscription: "subscriptions_single_open_charge" is a real
  // partial unique index (at most one OPEN/OVERDUE/PARTIALLY_PAID charge per subscription,
  // documented in CLAUDE.md's idempotency table), and several tests create multiple
  // non-terminal charges for the same customer in one test. periodStart also varies per
  // call to satisfy @@unique([subscriptionId, periodStart]). Assertions only depend on
  // dueAt/status/amounts, never on subscriptionId or periodStart.
  const offsetDays = periodOffset++;
  const subscription = await db.subscription.create({
    data: { customerId, priceCents: 10000n, cycle: 'MONTHLY', nextDueAt: NOW },
  });
  const charge = await db.charge.create({
    data: {
      subscriptionId: subscription.id,
      customerId,
      principalCents: opts.principalCents ?? 10000n,
      discountCents: 0n,
      periodStart: new Date(Date.UTC(2026, 6, 15 + offsetDays)),
      periodEnd: new Date(Date.UTC(2026, 7, 14 + offsetDays)),
      dueAt,
      status: (opts.status ?? 'OPEN') as never,
    },
  });
  if (opts.paidCents) {
    await db.payment.create({ data: { chargeId: charge.id, amountCents: opts.paidCents, paidAt: NOW } });
  }
  return charge;
}

beforeEach(async () => {
  periodOffset = 0;
  const customer = await db.customer.create({ data: { name: `Cliente Dashboard ${randomUUID()}` } });
  customerId = customer.id;
});

afterEach(async () => {
  await db.payment.deleteMany({ where: { charge: { customerId } } });
  await db.charge.deleteMany({ where: { customerId } });
  await db.subscription.deleteMany({ where: { customerId } });
  await db.customer.delete({ where: { id: customerId } });
});

describe('getDueDateOverview', () => {
  it('buckets each charge by due date and sums the outstanding amount per bucket', async () => {
    await createCharge(new Date('2026-08-15T23:59:59.000Z')); // due hoje (15/08) → D0, 10000 owed
    await createCharge(new Date('2026-08-14T23:59:59.000Z'), { status: 'OVERDUE' }); // due ontem (14/08) → D+1, 10000 owed
    await createCharge(new Date('2026-08-14T23:59:59.000Z'), { principalCents: 5000n, paidCents: 2000n }); // due ontem → D+1, 3000 owed (partial)

    const overview = await getDueDateOverview(NOW, TZ);

    const d0 = overview.buckets.find((b) => b.key === 'D0')!;
    expect(d0.count).toBe(1);
    expect(d0.amountCents).toBe('10000');

    const dPlus1 = overview.buckets.find((b) => b.key === 'D+1')!;
    expect(dPlus1.count).toBe(2);
    expect(dPlus1.amountCents).toBe('13000');
  });

  it('excludes PAID and CANCELLED charges from every bucket', async () => {
    await createCharge(new Date('2026-08-15T23:59:59.000Z'), { status: 'PAID' });
    await createCharge(new Date('2026-08-15T23:59:59.000Z'), { status: 'CANCELLED' });

    const overview = await getDueDateOverview(NOW, TZ);

    const total = overview.buckets.reduce((sum, b) => sum + b.count, 0);
    expect(total).toBe(0);
    expect(overview.charges).toHaveLength(0);
  });

  it('tags each returned charge with its bucket', async () => {
    const charge = await createCharge(new Date('2026-08-20T23:59:59.000Z')); // 5 days out → D-5

    const overview = await getDueDateOverview(NOW, TZ);

    const tagged = overview.charges.find((c) => c.id === charge.id);
    expect(tagged?.bucket).toBe('D-5');
  });

  it('all 6 buckets are present even when empty, count 0', async () => {
    const overview = await getDueDateOverview(NOW, TZ);
    expect(overview.buckets.map((b) => b.key)).toEqual(['D-5', 'D-2', 'D0', 'D+1', 'D+3', 'D+5']);
    expect(overview.buckets.every((b) => b.count === 0)).toBe(true);
  });
});
