import { randomUUID } from 'node:crypto';
import Decimal from 'decimal.js';
import { afterEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { getMarginAlertSummary } from './queries';

let customerId: string;

async function createSubscription(opts: {
  priceCents: bigint;
  costCents: bigint;
  status?: 'ACTIVE' | 'SUSPENDED' | 'CANCELLED';
  discountType?: 'PERCENT' | 'FIXED';
  discountValue?: Decimal;
  discountUntil?: Date | null;
}) {
  return db.subscription.create({
    data: {
      customerId,
      priceCents: opts.priceCents,
      costCents: opts.costCents,
      cycle: 'MONTHLY',
      nextDueAt: new Date('2026-09-01T02:59:59.000Z'),
      status: opts.status ?? 'ACTIVE',
      ...(opts.discountType !== undefined && { discountType: opts.discountType }),
      ...(opts.discountValue !== undefined && { discountValue: opts.discountValue }),
      ...(opts.discountUntil !== undefined && { discountUntil: opts.discountUntil }),
    },
  });
}

afterEach(async () => {
  if (!customerId) return;
  await db.subscription.deleteMany({ where: { customerId } });
  await db.customer.delete({ where: { id: customerId } });
});

describe('getMarginAlertSummary', () => {
  it('counts negative and below-threshold active subscriptions separately, ignores ok and non-active', async () => {
    const before = await getMarginAlertSummary(new Decimal('30'));

    const customer = await db.customer.create({ data: { name: `Cliente Margem ${randomUUID()}` } });
    customerId = customer.id;

    await createSubscription({ priceCents: 5_000n, costCents: 5_000n }); // negative
    await createSubscription({ priceCents: 3_000n, costCents: 5_000n }); // negative
    await createSubscription({ priceCents: 10_000n, costCents: 7_100n }); // below_threshold (29% < 30%)
    await createSubscription({ priceCents: 10_000n, costCents: 2_000n }); // ok (80%)
    await createSubscription({ priceCents: 1_000n, costCents: 5_000n, status: 'SUSPENDED' }); // negative but not ACTIVE — excluded

    const after = await getMarginAlertSummary(new Decimal('30'));

    expect(after.negativeCount - before.negativeCount).toBe(2);
    expect(after.belowThresholdCount - before.belowThresholdCount).toBe(1);
  });

  it('returns zero counts when every active subscription is healthy', async () => {
    const before = await getMarginAlertSummary(new Decimal('30'));

    const customer = await db.customer.create({ data: { name: `Cliente Margem OK ${randomUUID()}` } });
    customerId = customer.id;

    await createSubscription({ priceCents: 10_000n, costCents: 1_000n });

    const after = await getMarginAlertSummary(new Decimal('30'));

    expect(after.negativeCount - before.negativeCount).toBe(0);
    expect(after.belowThresholdCount - before.belowThresholdCount).toBe(0);
  });

  it('nets the active discount into billed amount, catching margin that only goes negative after discount', async () => {
    const before = await getMarginAlertSummary(new Decimal('30'));

    const customer = await db.customer.create({ data: { name: `Cliente Margem Desconto ${randomUUID()}` } });
    customerId = customer.id;

    // billed = 10_000 - 20% = 8_000 ≤ cost 9_000 → negative, though list price 10_000 vs cost 9_000 would read as positive margin.
    await createSubscription({
      priceCents: 10_000n,
      costCents: 9_000n,
      discountType: 'PERCENT',
      discountValue: new Decimal('20'),
      discountUntil: null,
    });

    const after = await getMarginAlertSummary(new Decimal('30'));

    expect(after.negativeCount - before.negativeCount).toBe(1);
  });
});
