import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { listPlans } from './queries';

let planId: string;
let otherPlanId: string;
let supplierId: string;
let customerId: string;

afterEach(async () => {
  await db.subscription.deleteMany({ where: { customerId } });
  await db.customer.deleteMany({ where: { id: customerId } });
  await db.plan.deleteMany({ where: { id: { in: [planId, otherPlanId] } } });
  await db.supplier.deleteMany({ where: { id: supplierId } });
});

describe('listPlans', () => {
  it('counts only ACTIVE subscriptions per plan and exposes the linked supplier name', async () => {
    const supplier = await db.supplier.create({ data: { name: `Fornecedor Plano ${randomUUID()}`, unitCostCents: 1_000n } });
    supplierId = supplier.id;
    const plan = await db.plan.create({
      data: { name: `Plano Mensal ${randomUUID()}`, priceCents: 4_500n, costCents: 1_600n, cycle: 'MONTHLY', supplierId },
    });
    planId = plan.id;
    const other = await db.plan.create({
      data: { name: `Plano Outro ${randomUUID()}`, priceCents: 9_000n, costCents: 3_000n, cycle: 'ANNUAL' },
    });
    otherPlanId = other.id;

    const customer = await db.customer.create({ data: { name: `Cliente Plano ${randomUUID()}` } });
    customerId = customer.id;

    await db.subscription.create({
      data: { customerId, planId, priceCents: 4_500n, costCents: 1_600n, cycle: 'MONTHLY', nextDueAt: new Date('2026-09-13T02:59:59.000Z') },
    });
    await db.subscription.create({
      data: {
        customerId, planId, priceCents: 4_500n, costCents: 1_600n, cycle: 'MONTHLY',
        nextDueAt: new Date('2026-09-13T02:59:59.000Z'), status: 'CANCELLED',
      },
    });

    const { rows } = await listPlans({ page: 1, perPage: 20 });
    const row = rows.find((r) => r.id === planId)!;
    const otherRow = rows.find((r) => r.id === otherPlanId)!;

    expect(row.activeSubscriptionsCount).toBe(1);
    expect(row.supplierName).toBe(supplier.name);
    expect(otherRow.activeSubscriptionsCount).toBe(0);
    expect(otherRow.supplierName).toBeNull();
  });
});
