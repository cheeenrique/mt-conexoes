import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { listBulkAdjustPreview } from './queries';

let supplierId: string;
let otherSupplierId: string;
let customerId: string;

async function createSubscription(opts: {
  priceCents: bigint;
  costCents: bigint;
  supplierId: string;
  status?: 'ACTIVE' | 'SUSPENDED' | 'CANCELLED';
}) {
  return db.subscription.create({
    data: {
      customerId,
      supplierId: opts.supplierId,
      priceCents: opts.priceCents,
      costCents: opts.costCents,
      cycle: 'MONTHLY',
      nextDueAt: new Date('2026-09-13T02:59:59.000Z'),
      status: opts.status ?? 'ACTIVE',
    },
  });
}

afterEach(async () => {
  await db.subscription.deleteMany({ where: { customerId } });
  await db.customer.deleteMany({ where: { id: customerId } });
  await db.supplier.deleteMany({ where: { id: { in: [supplierId, otherSupplierId] } } });
});

describe('listBulkAdjustPreview', () => {
  it('previews cost/price deltas for active subscriptions of the given supplier only', async () => {
    const customer = await db.customer.create({ data: { name: `Cliente Reajuste ${randomUUID()}` } });
    customerId = customer.id;
    const supplier = await db.supplier.create({ data: { name: `Fornecedor A ${randomUUID()}`, unitCostCents: 4_000n } });
    supplierId = supplier.id;
    const other = await db.supplier.create({ data: { name: `Fornecedor B ${randomUUID()}`, unitCostCents: 1_000n } });
    otherSupplierId = other.id;

    const active = await createSubscription({ priceCents: 10_000n, costCents: 3_000n, supplierId });
    await createSubscription({ priceCents: 10_000n, costCents: 3_000n, supplierId, status: 'SUSPENDED' });
    await createSubscription({ priceCents: 10_000n, costCents: 3_000n, supplierId: otherSupplierId });

    const preview = await listBulkAdjustPreview(supplierId);

    expect(preview).toHaveLength(1);
    expect(preview[0]).toMatchObject({
      subscriptionId: active.id,
      customerName: customer.name,
      oldCostCents: '3000',
      newCostCents: '4000',
      oldPriceCents: '10000',
      newPriceCents: '11000', // 10000 + (4000 - 3000)
    });
  });

  it('a subscription whose costCents already exceeds the new supplier cost gets a lower price, clamped at zero if it would go negative', async () => {
    const customer = await db.customer.create({ data: { name: `Cliente Reajuste ${randomUUID()}` } });
    customerId = customer.id;
    const supplier = await db.supplier.create({ data: { name: `Fornecedor C ${randomUUID()}`, unitCostCents: 4_000n } });
    supplierId = supplier.id;
    const other = await db.supplier.create({ data: { name: `Fornecedor D ${randomUUID()}`, unitCostCents: 1_000n } });
    otherSupplierId = other.id; // unused by this test's assertions, created only so afterEach's cleanup shape stays the same across both tests

    await createSubscription({ priceCents: 500n, costCents: 6_000n, supplierId }); // already overridden above new cost

    const preview = await listBulkAdjustPreview(supplierId);

    expect(preview).toHaveLength(1);
    // delta = 4000 - 6000 = -2000; newPrice = 500 - 2000 = -1500 -> clamped to 0
    expect(preview[0].newPriceCents).toBe('0');
  });
});
