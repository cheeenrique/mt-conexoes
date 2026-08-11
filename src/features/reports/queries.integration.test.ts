import { afterEach, describe, expect, it } from 'vitest';
import type { ChargeStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { monthBoundsUtc } from '@/core/dates';
import { getCustomerPnl, getMonthlySummary, getSupplierBreakdown, getPlanBreakdown } from './queries';

const TZ = 'America/Sao_Paulo';

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

  it('soma acima de Number.MAX_SAFE_INTEGER sobrevive ao ::text como string exata', async () => {
    const { customer, subscription, supplier } = await seedCustomerWithCharges();
    const principalCents = 9_007_199_254_740_993n; // 2^53 + 1, fora da faixa segura de number

    await createCharge(subscription.id, customer.id, supplier.id, {
      periodStart: new Date('2026-01-01'), principalCents, discountCents: 0n, costCents: 0n, status: 'PAID',
    });

    const result = await getCustomerPnl(customer.id);

    expect(result.billedCents).toBe('9007199254740993');
  });
});

async function seedMonthlyFixture() {
  const supplierA = await db.supplier.create({ data: { name: 'Fornecedor Mês A', unitCostCents: 1000n } });
  const supplierB = await db.supplier.create({ data: { name: 'Fornecedor Mês B', unitCostCents: 1000n } });
  const planA = await db.plan.create({ data: { name: 'Plano Mês A', priceCents: 6000n, costCents: 1000n, cycle: 'MONTHLY' } });
  const customer = await db.customer.create({ data: { name: 'Mês Teste', phone: '+5511998880888' } });
  const subA = await db.subscription.create({
    data: { customerId: customer.id, planId: planA.id, supplierId: supplierA.id, priceCents: 6000n, costCents: 1000n, cycle: 'MONTHLY', status: 'ACTIVE', startedAt: new Date('2026-01-01T12:00:00Z'), nextDueAt: new Date('2026-02-01T12:00:00Z') },
  });
  const subB = await db.subscription.create({
    data: { customerId: customer.id, planId: planA.id, supplierId: supplierB.id, priceCents: 6000n, costCents: 1000n, cycle: 'MONTHLY', status: 'ACTIVE', startedAt: new Date('2026-01-01T12:00:00Z'), nextDueAt: new Date('2026-02-01T12:00:00Z') },
  });
  return { supplierA, supplierB, planA, customer, subA, subB };
}

afterEach(async () => {
  await db.charge.deleteMany({ where: { customer: { name: 'Mês Teste' } } });
  await db.subscription.deleteMany({ where: { customer: { name: 'Mês Teste' } } });
  await db.customer.deleteMany({ where: { name: 'Mês Teste' } });
  await db.plan.deleteMany({ where: { name: 'Plano Mês A' } });
  await db.supplier.deleteMany({ where: { name: { startsWith: 'Fornecedor Mês' } } });
});

describe('getMonthlySummary', () => {
  it('soma billedCents/costCents dentro do mês, exclui CANCELLED e outros meses', async () => {
    const { customer, supplierA, supplierB, subA, subB } = await seedMonthlyFixture();
    const { from, to } = monthBoundsUtc(2026, 7, TZ); // agosto (0-indexed)
    await db.charge.create({ data: { subscriptionId: subA.id, customerId: customer.id, supplierId: supplierA.id, principalCents: 6000n, costCents: 1000n, periodStart: new Date('2026-08-01'), periodEnd: new Date('2026-08-01'), dueAt: new Date('2026-08-15T23:59:59-03:00'), status: 'PAID' } });
    await db.charge.create({ data: { subscriptionId: subA.id, customerId: customer.id, supplierId: supplierA.id, principalCents: 6000n, costCents: 1000n, periodStart: new Date('2026-09-01'), periodEnd: new Date('2026-09-01'), dueAt: new Date('2026-09-15T23:59:59-03:00'), status: 'OPEN' } });
    // periodStart em subscription diferente (subB) — (subscriptionId, periodStart) é único no banco,
    // e subA já tem uma cobrança nesse periodStart.
    await db.charge.create({ data: { subscriptionId: subB.id, customerId: customer.id, supplierId: supplierB.id, principalCents: 6000n, costCents: 1000n, periodStart: new Date('2026-08-01'), periodEnd: new Date('2026-08-01'), dueAt: new Date('2026-08-20T23:59:59-03:00'), status: 'CANCELLED' } });

    const result = await getMonthlySummary(from, to);

    expect(result.billedCents).toBe('6000');
    expect(result.costCents).toBe('1000');
  });

  it('openCents/costAtRiskCents somam só status não-terminal, PAID entra em billedCents mas não nesses dois', async () => {
    const { customer, supplierA, subA } = await seedMonthlyFixture();
    const { from, to } = monthBoundsUtc(2026, 7, TZ);
    await db.charge.create({ data: { subscriptionId: subA.id, customerId: customer.id, supplierId: supplierA.id, principalCents: 6000n, costCents: 1000n, periodStart: new Date('2026-08-01'), periodEnd: new Date('2026-08-01'), dueAt: new Date('2026-08-15T23:59:59-03:00'), status: 'PAID' } });
    await db.charge.create({ data: { subscriptionId: subA.id, customerId: customer.id, supplierId: supplierA.id, principalCents: 4000n, costCents: 500n, periodStart: new Date('2026-08-02'), periodEnd: new Date('2026-08-02'), dueAt: new Date('2026-08-16T23:59:59-03:00'), status: 'OVERDUE' } });

    const result = await getMonthlySummary(from, to);

    expect(result.billedCents).toBe('10000');
    expect(result.openCents).toBe('4000');
    expect(result.costAtRiskCents).toBe('500');
  });

  it('limite de mês respeita fuso local — cobrança 23h59 do último dia do mês em SP entra no mês certo', async () => {
    const { customer, supplierA, subA } = await seedMonthlyFixture();
    const { from, to } = monthBoundsUtc(2026, 7, TZ); // agosto
    // 31/08 23:59:59 em America/Sao_Paulo (UTC-3) é 01/09 02:59:59 em UTC — se o código usasse
    // date_trunc em UTC, isso cairia em setembro por engano.
    await db.charge.create({ data: { subscriptionId: subA.id, customerId: customer.id, supplierId: supplierA.id, principalCents: 6000n, costCents: 1000n, periodStart: new Date('2026-08-31'), periodEnd: new Date('2026-08-31'), dueAt: new Date('2026-08-31T23:59:59-03:00'), status: 'OPEN' } });

    const result = await getMonthlySummary(from, to);

    expect(result.billedCents).toBe('6000');
  });
});

describe('getSupplierBreakdown', () => {
  it('agrupa por fornecedor, exclui fornecedor sem cobrança no mês', async () => {
    const { customer, supplierA, supplierB, subA, subB } = await seedMonthlyFixture();
    const { from, to } = monthBoundsUtc(2026, 7, TZ);
    await db.charge.create({ data: { subscriptionId: subA.id, customerId: customer.id, supplierId: supplierA.id, principalCents: 6000n, costCents: 1000n, periodStart: new Date('2026-08-01'), periodEnd: new Date('2026-08-01'), dueAt: new Date('2026-08-15T23:59:59-03:00'), status: 'PAID' } });
    // subB não recebe cobrança nenhuma — não deve aparecer na quebra.
    void subB;

    const rows = await getSupplierBreakdown(from, to);

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(supplierA.id);
    expect(rows[0].billedCents).toBe('6000');
    expect(rows.find((r) => r.id === supplierB.id)).toBeUndefined();
  });
});

describe('getPlanBreakdown', () => {
  it('agrupa por plano via subscription', async () => {
    const { customer, supplierA, planA, subA } = await seedMonthlyFixture();
    const { from, to } = monthBoundsUtc(2026, 7, TZ);
    await db.charge.create({ data: { subscriptionId: subA.id, customerId: customer.id, supplierId: supplierA.id, principalCents: 6000n, costCents: 1000n, periodStart: new Date('2026-08-01'), periodEnd: new Date('2026-08-01'), dueAt: new Date('2026-08-15T23:59:59-03:00'), status: 'PAID' } });

    const rows = await getPlanBreakdown(from, to);

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(planA.id);
    expect(rows[0].billedCents).toBe('6000');
  });
});
