import { randomUUID } from 'node:crypto';
import Decimal from 'decimal.js';
import { afterEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { listBulkAdjustPreview, listSuppliers } from './queries';

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
  it('previews price and margin before/after for active subscriptions of the given supplier only, when the new margin falls below the alert threshold', async () => {
    const customer = await db.customer.create({ data: { name: `Cliente Reajuste ${randomUUID()}` } });
    customerId = customer.id;
    const supplier = await db.supplier.create({ data: { name: `Fornecedor A ${randomUUID()}`, unitCostCents: 4_000n } });
    supplierId = supplier.id;
    const other = await db.supplier.create({ data: { name: `Fornecedor B ${randomUUID()}`, unitCostCents: 1_000n } });
    otherSupplierId = other.id;

    const active = await createSubscription({ priceCents: 10_000n, costCents: 3_000n, supplierId });
    await createSubscription({ priceCents: 10_000n, costCents: 3_000n, supplierId, status: 'SUSPENDED' });
    await createSubscription({ priceCents: 10_000n, costCents: 3_000n, supplierId: otherSupplierId });

    // newPrice = 10000 + (4000 - 3000) = 11000; newMargin = (11000-4000)/11000 = 63.63...%, abaixo do limite de 70%.
    const preview = await listBulkAdjustPreview(supplierId, new Decimal('70'));

    expect(preview).toHaveLength(1);
    expect(preview[0].subscriptionId).toBe(active.id);
    expect(preview[0].customerName).toBe(customer.name);
    expect(preview[0].oldPriceCents).toBe('10000');
    expect(preview[0].newPriceCents).toBe('11000');
    expect(preview[0].oldMarginPercent).not.toBeNull();
    expect(new Decimal(preview[0].newMarginPercent!).toFixed(1)).toBe('63.6');
  });

  it('excludes a subscription whose margin after the adjustment stays at or above the alert threshold', async () => {
    const customer = await db.customer.create({ data: { name: `Cliente AcimaLimite ${randomUUID()}` } });
    customerId = customer.id;
    const supplier = await db.supplier.create({ data: { name: `Fornecedor E ${randomUUID()}`, unitCostCents: 4_000n } });
    supplierId = supplier.id;
    const other = await db.supplier.create({ data: { name: `Fornecedor F ${randomUUID()}`, unitCostCents: 1_000n } });
    otherSupplierId = other.id;

    // newPrice = 10000 + (4000 - 3000) = 11000; newMargin = 63.63...%, acima do limite de 30%.
    await createSubscription({ priceCents: 10_000n, costCents: 3_000n, supplierId });

    const preview = await listBulkAdjustPreview(supplierId, new Decimal('30'));

    expect(preview).toHaveLength(0);
  });

  it('a subscription whose costCents already exceeds the new supplier cost gets a lower price, clamped at zero if it would go negative, and always counts as below threshold (negative margin)', async () => {
    const customer = await db.customer.create({ data: { name: `Cliente Reajuste ${randomUUID()}` } });
    customerId = customer.id;
    const supplier = await db.supplier.create({ data: { name: `Fornecedor C ${randomUUID()}`, unitCostCents: 4_000n } });
    supplierId = supplier.id;
    const other = await db.supplier.create({ data: { name: `Fornecedor D ${randomUUID()}`, unitCostCents: 1_000n } });
    otherSupplierId = other.id; // unused by this test's assertions, created only so afterEach's cleanup shape stays the same across both tests

    await createSubscription({ priceCents: 500n, costCents: 6_000n, supplierId }); // already overridden above new cost

    const preview = await listBulkAdjustPreview(supplierId, new Decimal('0'));

    expect(preview).toHaveLength(1);
    // delta = 4000 - 6000 = -2000; newPrice = 500 - 2000 = -1500 -> clamped to 0
    expect(preview[0].newPriceCents).toBe('0');
    expect(preview[0].newMarginPercent).toBeNull(); // revenueCents 0 → marginPercent null, mas ainda 'negative' e por isso listado
  });
});

describe('listSuppliers', () => {
  it('weighs the margin by active subscription volume, not the simple average of each percentage', async () => {
    const customer = await db.customer.create({ data: { name: `Cliente Ponderado ${randomUUID()}` } });
    customerId = customer.id;
    const supplier = await db.supplier.create({ data: { name: `Fornecedor Ponderado ${randomUUID()}`, unitCostCents: 1_000n } });
    supplierId = supplier.id;
    const other = await db.supplier.create({ data: { name: `Fornecedor Ponderado Outro ${randomUUID()}`, unitCostCents: 1_000n } });
    otherSupplierId = other.id;

    // margem 50% (10000-5000)/10000, mas com volume pequeno.
    await createSubscription({ priceCents: 10_000n, costCents: 5_000n, supplierId });
    // margem 10% (100000-90000)/100000, com volume 10x maior — puxa a média ponderada pra baixo.
    await createSubscription({ priceCents: 100_000n, costCents: 90_000n, supplierId });
    // suspensa não conta nem no denominador nem no numerador.
    await createSubscription({ priceCents: 10_000n, costCents: 1_000n, supplierId, status: 'SUSPENDED' });

    const { rows } = await listSuppliers({ page: 1, perPage: 20 });
    const row = rows.find((r) => r.id === supplierId)!;

    expect(row.activeSubscriptionsCount).toBe(2);
    // SUM(price-cost)/SUM(price) = (5000+10000)/(10000+100000) = 15000/110000 ≈ 13.636...%
    // Simples média dos percentuais daria 30% — bem diferente, prova que é ponderada.
    expect(new Decimal(row.averageMarginPercent!).toFixed(1)).toBe('13.6');
  });

  it('a supplier with no active subscription shows count 0 and margin null (not 0%)', async () => {
    const customer = await db.customer.create({ data: { name: `Cliente SemAssinatura ${randomUUID()}` } });
    customerId = customer.id;
    const supplier = await db.supplier.create({ data: { name: `Fornecedor SemAssinatura ${randomUUID()}`, unitCostCents: 1_000n } });
    supplierId = supplier.id;
    const other = await db.supplier.create({ data: { name: `Fornecedor SemAssinatura Outro ${randomUUID()}`, unitCostCents: 1_000n } });
    otherSupplierId = other.id;

    await createSubscription({ priceCents: 10_000n, costCents: 1_000n, supplierId, status: 'CANCELLED' });

    const { rows } = await listSuppliers({ page: 1, perPage: 20 });
    const row = rows.find((r) => r.id === supplierId)!;

    expect(row.activeSubscriptionsCount).toBe(0);
    expect(row.averageMarginPercent).toBeNull();
  });

  it('handles a single active subscription of 1 cent and a repeating-decimal margin without float drift', async () => {
    const customer = await db.customer.create({ data: { name: `Cliente Centavo ${randomUUID()}` } });
    customerId = customer.id;
    const supplier = await db.supplier.create({ data: { name: `Fornecedor Centavo ${randomUUID()}`, unitCostCents: 1_000n } });
    supplierId = supplier.id;
    const other = await db.supplier.create({ data: { name: `Fornecedor Centavo Outro ${randomUUID()}`, unitCostCents: 1_000n } });
    otherSupplierId = other.id;

    // R$ 0,01 de receita, R$ 0,00 de custo → margem 100%.
    await createSubscription({ priceCents: 1n, costCents: 0n, supplierId });

    const { rows } = await listSuppliers({ page: 1, perPage: 20 });
    const row = rows.find((r) => r.id === supplierId)!;

    expect(row.activeSubscriptionsCount).toBe(1);
    expect(new Decimal(row.averageMarginPercent!).toFixed(0)).toBe('100');
  });
});
