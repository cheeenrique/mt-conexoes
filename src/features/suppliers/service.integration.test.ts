import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { applyBulkPriceAdjustment } from './service';

let supplierId: string;
let customerId: string;

afterEach(async () => {
  await db.payment.deleteMany({ where: { charge: { customerId } } });
  await db.charge.deleteMany({ where: { customerId } });
  await db.subscription.deleteMany({ where: { customerId } });
  await db.customer.deleteMany({ where: { id: customerId } });
  await db.supplier.deleteMany({ where: { id: supplierId } });
});

describe('applyBulkPriceAdjustment', () => {
  it('updates costCents and priceCents on every active subscription of the supplier, matching the preview formula', async () => {
    const customer = await db.customer.create({ data: { name: `Cliente Aplicar ${randomUUID()}` } });
    customerId = customer.id;
    const supplier = await db.supplier.create({ data: { name: `Fornecedor Aplicar ${randomUUID()}`, unitCostCents: 5_000n } });
    supplierId = supplier.id;

    const sub = await db.subscription.create({
      data: {
        customerId, supplierId,
        priceCents: 12_000n, costCents: 3_000n, cycle: 'MONTHLY',
        nextDueAt: new Date('2026-09-13T02:59:59.000Z'),
      },
    });

    const result = await applyBulkPriceAdjustment(supplierId);

    expect(result.count).toBe(1);
    const updated = await db.subscription.findUniqueOrThrow({ where: { id: sub.id } });
    expect(updated.costCents).toBe(5_000n);
    expect(updated.priceCents).toBe(14_000n); // 12000 + (5000 - 3000)
  });

  it('never modifies an already-issued Charge — its principal, discount and cost stay frozen', async () => {
    const customer = await db.customer.create({ data: { name: `Cliente Congelado ${randomUUID()}` } });
    customerId = customer.id;
    const supplier = await db.supplier.create({ data: { name: `Fornecedor Congelado ${randomUUID()}`, unitCostCents: 5_000n } });
    supplierId = supplier.id;

    const sub = await db.subscription.create({
      data: {
        customerId, supplierId,
        priceCents: 12_000n, costCents: 3_000n, cycle: 'MONTHLY',
        nextDueAt: new Date('2026-09-13T02:59:59.000Z'),
      },
    });
    const charge = await db.charge.create({
      data: {
        subscriptionId: sub.id, customerId, supplierId,
        principalCents: 12_000n, discountCents: 0n, costCents: 3_000n,
        periodStart: new Date('2026-08-13T00:00:00.000Z'),
        periodEnd: new Date('2026-09-12T00:00:00.000Z'),
        dueAt: new Date('2026-09-13T02:59:59.000Z'),
      },
    });

    await applyBulkPriceAdjustment(supplierId);

    const untouchedCharge = await db.charge.findUniqueOrThrow({ where: { id: charge.id } });
    expect(untouchedCharge.principalCents).toBe(12_000n);
    expect(untouchedCharge.costCents).toBe(3_000n);
  });

  it('does not touch a subscription belonging to a different supplier', async () => {
    const customer = await db.customer.create({ data: { name: `Cliente Outro ${randomUUID()}` } });
    customerId = customer.id;
    const supplier = await db.supplier.create({ data: { name: `Fornecedor X ${randomUUID()}`, unitCostCents: 5_000n } });
    supplierId = supplier.id;
    const otherSupplier = await db.supplier.create({ data: { name: `Fornecedor Y ${randomUUID()}`, unitCostCents: 1_000n } });

    const sub = await db.subscription.create({
      data: {
        customerId, supplierId: otherSupplier.id,
        priceCents: 9_000n, costCents: 2_000n, cycle: 'MONTHLY',
        nextDueAt: new Date('2026-09-13T02:59:59.000Z'),
      },
    });

    const result = await applyBulkPriceAdjustment(supplierId);

    expect(result.count).toBe(0);
    const unchanged = await db.subscription.findUniqueOrThrow({ where: { id: sub.id } });
    expect(unchanged.priceCents).toBe(9_000n);
    await db.subscription.delete({ where: { id: sub.id } });
    await db.supplier.delete({ where: { id: otherSupplier.id } });
  });
});
