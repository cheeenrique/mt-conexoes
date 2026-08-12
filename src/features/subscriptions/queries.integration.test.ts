import { randomUUID } from 'node:crypto';
import Decimal from 'decimal.js';
import { afterEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { getMarginAlertSummary } from './queries';

let customerId: string;

async function createSubscription(opts: { priceCents: bigint; costCents: bigint; status?: 'ACTIVE' | 'SUSPENDED' | 'CANCELLED' }) {
  return db.subscription.create({
    data: {
      customerId,
      priceCents: opts.priceCents,
      costCents: opts.costCents,
      cycle: 'MONTHLY',
      nextDueAt: new Date('2026-09-01T02:59:59.000Z'),
      status: opts.status ?? 'ACTIVE',
    },
  });
}

afterEach(async () => {
  await db.subscription.deleteMany({ where: { customerId } });
  await db.customer.delete({ where: { id: customerId } });
});

describe('getMarginAlertSummary', () => {
  it('counts negative and below-threshold active subscriptions separately, ignores ok and non-active', async () => {
    const customer = await db.customer.create({ data: { name: `Cliente Margem ${randomUUID()}` } });
    customerId = customer.id;

    await createSubscription({ priceCents: 5_000n, costCents: 5_000n }); // negative
    await createSubscription({ priceCents: 3_000n, costCents: 5_000n }); // negative
    await createSubscription({ priceCents: 10_000n, costCents: 7_100n }); // below_threshold (29% < 30%)
    await createSubscription({ priceCents: 10_000n, costCents: 2_000n }); // ok (80%)
    await createSubscription({ priceCents: 1_000n, costCents: 5_000n, status: 'SUSPENDED' }); // negative but not ACTIVE — excluded

    const summary = await getMarginAlertSummary(new Decimal('30'));

    expect(summary.negativeCount).toBe(2);
    expect(summary.belowThresholdCount).toBe(1);
  });

  it('returns zero counts when every active subscription is healthy', async () => {
    const customer = await db.customer.create({ data: { name: `Cliente Margem OK ${randomUUID()}` } });
    customerId = customer.id;

    await createSubscription({ priceCents: 10_000n, costCents: 1_000n });

    const summary = await getMarginAlertSummary(new Decimal('30'));

    expect(summary.negativeCount).toBe(0);
    expect(summary.belowThresholdCount).toBe(0);
  });
});
