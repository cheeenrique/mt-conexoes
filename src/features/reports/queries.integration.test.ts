import { afterEach, describe, expect, it } from 'vitest';
import type { ChargeStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { getCustomerPnl } from './queries';

async function seedCustomerWithCharges() {
  const supplier = await db.supplier.create({ data: { name: 'Fornecedor PNL', unitCostCents: 1000n } });
  const plan = await db.plan.create({ data: { name: 'Plano PNL', priceCents: 6000n, costCents: 1000n, cycle: 'MONTHLY' } });
  const customer = await db.customer.create({ data: { name: 'PNL Teste', phone: '+5511998880777' } });
  const subscription = await db.subscription.create({
    data: {
      customerId: customer.id, planId: plan.id, supplierId: supplier.id,
      priceCents: 6000n, costCents: 1000n, cycle: 'MONTHLY', status: 'ACTIVE',
      startedAt: new Date('2026-01-01T12:00:00Z'), nextDueAt: new Date('2026-02-01T12:00:00Z'),
    },
  });
  return { supplier, plan, customer, subscription };
}

async function createCharge(
  subscriptionId: string, customerId: string, supplierId: string,
  overrides: { principalCents?: bigint; discountCents?: bigint; costCents?: bigint; status?: ChargeStatus; periodStart: Date },
) {
  return db.charge.create({
    data: {
      subscriptionId, customerId, supplierId,
      principalCents: overrides.principalCents ?? 6000n,
      discountCents: overrides.discountCents ?? 0n,
      costCents: overrides.costCents ?? 1000n,
      periodStart: overrides.periodStart,
      periodEnd: overrides.periodStart,
      dueAt: overrides.periodStart,
      status: overrides.status ?? 'OPEN',
    },
  });
}

afterEach(async () => {
  await db.payment.deleteMany({ where: { charge: { customer: { name: 'PNL Teste' } } } });
  await db.charge.deleteMany({ where: { customer: { name: 'PNL Teste' } } });
  await db.subscription.deleteMany({ where: { customer: { name: 'PNL Teste' } } });
  await db.customer.deleteMany({ where: { name: 'PNL Teste' } });
  await db.plan.deleteMany({ where: { name: 'Plano PNL' } });
  await db.supplier.deleteMany({ where: { name: 'Fornecedor PNL' } });
});

describe('getCustomerPnl', () => {
  it('cliente sem nenhuma cobrança: tudo zerado, sem lançar', async () => {
    const { customer } = await seedCustomerWithCharges();

    const result = await getCustomerPnl(customer.id);

    expect(result).toEqual({
      billedCents: '0', receivedCents: '0', costCents: '0',
      chargesCount: 0, paidCount: 0, overdueCount: 0, openCount: 0,
    });
  });

  it('cobrança CANCELLED não entra em nenhuma soma nem contagem', async () => {
    const { customer, subscription, supplier } = await seedCustomerWithCharges();
    await createCharge(subscription.id, customer.id, supplier.id, { periodStart: new Date('2026-01-01'), status: 'CANCELLED' });
    await createCharge(subscription.id, customer.id, supplier.id, { periodStart: new Date('2026-02-01'), status: 'OPEN' });

    const result = await getCustomerPnl(customer.id);

    expect(result.chargesCount).toBe(1);
    expect(result.billedCents).toBe('6000');
  });

  it('desconto reduz billedCents mas não costCents', async () => {
    const { customer, subscription, supplier } = await seedCustomerWithCharges();
    await createCharge(subscription.id, customer.id, supplier.id, {
      periodStart: new Date('2026-01-01'), principalCents: 6000n, discountCents: 1000n, costCents: 1000n, status: 'PAID',
    });

    const result = await getCustomerPnl(customer.id);

    expect(result.billedCents).toBe('5000');
    expect(result.costCents).toBe('1000');
  });

  it('receivedCents soma pagamentos de todas as cobranças do cliente', async () => {
    const { customer, subscription, supplier } = await seedCustomerWithCharges();
    const charge1 = await createCharge(subscription.id, customer.id, supplier.id, { periodStart: new Date('2026-01-01'), status: 'PAID' });
    const charge2 = await createCharge(subscription.id, customer.id, supplier.id, { periodStart: new Date('2026-02-01'), status: 'PARTIALLY_PAID' });
    await db.payment.create({ data: { chargeId: charge1.id, amountCents: 6000n, paidAt: new Date('2026-01-05') } });
    await db.payment.create({ data: { chargeId: charge2.id, amountCents: 2000n, paidAt: new Date('2026-02-05') } });

    const result = await getCustomerPnl(customer.id);

    expect(result.receivedCents).toBe('8000');
  });

  it('paidCount + overdueCount + openCount somam chargesCount quando não há CANCELLED', async () => {
    // subscriptions_single_open_charge permite no máximo uma cobrança OPEN/OVERDUE/PARTIALLY_PAID
    // por assinatura — cada status não-terminal precisa da sua própria assinatura.
    const { customer, subscription, supplier, plan } = await seedCustomerWithCharges();
    const subscription2 = await db.subscription.create({
      data: {
        customerId: customer.id, planId: plan.id, supplierId: supplier.id,
        priceCents: 6000n, costCents: 1000n, cycle: 'MONTHLY', status: 'ACTIVE',
        startedAt: new Date('2026-01-01T12:00:00Z'), nextDueAt: new Date('2026-02-01T12:00:00Z'),
      },
    });
    const subscription3 = await db.subscription.create({
      data: {
        customerId: customer.id, planId: plan.id, supplierId: supplier.id,
        priceCents: 6000n, costCents: 1000n, cycle: 'MONTHLY', status: 'ACTIVE',
        startedAt: new Date('2026-01-01T12:00:00Z'), nextDueAt: new Date('2026-02-01T12:00:00Z'),
      },
    });
    await createCharge(subscription.id, customer.id, supplier.id, { periodStart: new Date('2026-01-01'), status: 'PAID' });
    await createCharge(subscription.id, customer.id, supplier.id, { periodStart: new Date('2026-02-01'), status: 'OVERDUE' });
    await createCharge(subscription2.id, customer.id, supplier.id, { periodStart: new Date('2026-03-01'), status: 'OPEN' });
    await createCharge(subscription3.id, customer.id, supplier.id, { periodStart: new Date('2026-04-01'), status: 'PARTIALLY_PAID' });

    const result = await getCustomerPnl(customer.id);

    expect(result.chargesCount).toBe(4);
    expect(result.paidCount + result.overdueCount + result.openCount).toBe(4);
    expect(result.paidCount).toBe(1);
    expect(result.overdueCount).toBe(1);
    expect(result.openCount).toBe(2);
  });
});
