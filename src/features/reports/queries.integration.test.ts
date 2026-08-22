import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import type { BillingCycle, ChargeStatus, SubscriptionStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { monthBoundsUtc, startOfLocalDay } from '@/core/dates';
import { marginPercent } from '@/core/money';
import { getCustomerPnl, getMonthlySummary, getSupplierBreakdown, getPlanBreakdown, getCustomerBreakdown, getMonthlyTrend, getDashboardKpis } from './queries';

function sumBilledCents(rows: { billedCents: string }[]): bigint {
  return rows.reduce((acc, r) => acc + BigInt(r.billedCents), 0n);
}

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
  // `startsWith` e não igualdade: getCustomerBreakdown cria 'Mês Teste Cliente N'
  // e 'Mês Teste Muitos N' e os limpa no corpo do teste — se o teste falha antes
  // disso, as linhas ficam e derrubam as suítes de mês na execução seguinte.
  const strays = { customer: { name: { startsWith: 'Mês Teste' } } };
  await db.payment.deleteMany({ where: { charge: strays } });
  await db.charge.deleteMany({ where: strays });
  await db.subscription.deleteMany({ where: strays });
  await db.customer.deleteMany({ where: { name: { startsWith: 'Mês Teste' } } });
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

  it('receivedCents soma só pagamentos com paidAt dentro do mês', async () => {
    const { customer, supplierA, subA } = await seedMonthlyFixture();
    const { from, to } = monthBoundsUtc(2026, 7, TZ); // agosto
    const chargeInMonth = await db.charge.create({ data: { subscriptionId: subA.id, customerId: customer.id, supplierId: supplierA.id, principalCents: 6000n, costCents: 1000n, periodStart: new Date('2026-08-01'), periodEnd: new Date('2026-08-01'), dueAt: new Date('2026-08-15T23:59:59-03:00'), status: 'PAID' } });
    const chargeOtherMonth = await db.charge.create({ data: { subscriptionId: subA.id, customerId: customer.id, supplierId: supplierA.id, principalCents: 6000n, costCents: 1000n, periodStart: new Date('2026-09-01'), periodEnd: new Date('2026-09-01'), dueAt: new Date('2026-09-15T23:59:59-03:00'), status: 'PAID' } });
    await db.payment.create({ data: { chargeId: chargeInMonth.id, amountCents: 6000n, paidAt: new Date('2026-08-10T12:00:00Z') } });
    // Pagamento fora do mês testado — não deve entrar na soma.
    await db.payment.create({ data: { chargeId: chargeOtherMonth.id, amountCents: 6000n, paidAt: new Date('2026-09-10T12:00:00Z') } });

    const result = await getMonthlySummary(from, to);

    expect(result.receivedCents).toBe('6000');
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

describe('reconciliação: soma das quebras bate com o painel geral', () => {
  afterEach(async () => {
    await db.charge.deleteMany({ where: { customer: { name: 'Reconciliação Teste' } } });
    await db.subscription.deleteMany({ where: { customer: { name: 'Reconciliação Teste' } } });
    await db.customer.deleteMany({ where: { name: 'Reconciliação Teste' } });
    await db.plan.deleteMany({ where: { name: 'Plano Reconciliação' } });
    await db.supplier.deleteMany({ where: { name: 'Fornecedor Reconciliação' } });
  });

  it('sum(getSupplierBreakdown.billedCents) e sum(getPlanBreakdown.billedCents) batem com getMonthlySummary.billedCents mesmo com cobrança sem fornecedor/plano', async () => {
    const supplier = await db.supplier.create({ data: { name: 'Fornecedor Reconciliação', unitCostCents: 1000n } });
    const plan = await db.plan.create({ data: { name: 'Plano Reconciliação', priceCents: 6000n, costCents: 1000n, cycle: 'MONTHLY' } });
    const customer = await db.customer.create({ data: { name: 'Reconciliação Teste', phone: '+5511998880999' } });
    const { from, to } = monthBoundsUtc(2026, 7, TZ); // agosto

    // Assinatura COM fornecedor e plano.
    const subWithSupplier = await db.subscription.create({
      data: { customerId: customer.id, planId: plan.id, supplierId: supplier.id, priceCents: 6000n, costCents: 1000n, cycle: 'MONTHLY', status: 'ACTIVE', startedAt: new Date('2026-01-01T12:00:00Z'), nextDueAt: new Date('2026-02-01T12:00:00Z') },
    });
    await db.charge.create({ data: { subscriptionId: subWithSupplier.id, customerId: customer.id, supplierId: supplier.id, principalCents: 6000n, costCents: 1000n, periodStart: new Date('2026-08-01'), periodEnd: new Date('2026-08-01'), dueAt: new Date('2026-08-15T23:59:59-03:00'), status: 'PAID' } });

    // Assinatura SEM fornecedor nem plano — grava supplierId/planId null como acontece de verdade (subscriptions/service.ts).
    const subWithoutSupplier = await db.subscription.create({
      data: { customerId: customer.id, priceCents: 6000n, costCents: 1000n, cycle: 'MONTHLY', status: 'ACTIVE', startedAt: new Date('2026-01-01T12:00:00Z'), nextDueAt: new Date('2026-02-01T12:00:00Z') },
    });
    await db.charge.create({ data: { subscriptionId: subWithoutSupplier.id, customerId: customer.id, principalCents: 6000n, costCents: 1000n, periodStart: new Date('2026-08-02'), periodEnd: new Date('2026-08-02'), dueAt: new Date('2026-08-16T23:59:59-03:00'), status: 'OPEN' } });

    const summary = await getMonthlySummary(from, to);
    const supplierRows = await getSupplierBreakdown(from, to);
    const planRows = await getPlanBreakdown(from, to);

    expect(summary.billedCents).toBe('12000');
    expect(sumBilledCents(supplierRows)).toBe(BigInt(summary.billedCents));
    expect(sumBilledCents(planRows)).toBe(BigInt(summary.billedCents));
    expect(supplierRows.some((r) => r.id === null && r.name === 'Sem fornecedor')).toBe(true);
    expect(planRows.some((r) => r.id === null && r.name === 'Sem plano')).toBe(true);
  });
});

describe('getCustomerBreakdown', () => {
  it('top e bottom não se sobrepõem quando há poucos clientes', async () => {
    const { supplierA, planA } = await seedMonthlyFixture();
    const { from, to } = monthBoundsUtc(2026, 7, TZ);
    const customers = await Promise.all(
      Array.from({ length: 5 }, (_, i) => db.customer.create({ data: { name: `Mês Teste Cliente ${i}`, phone: `+551199888${1000 + i}` } })),
    );
    for (const [i, c] of customers.entries()) {
      const sub = await db.subscription.create({ data: { customerId: c.id, planId: planA.id, supplierId: supplierA.id, priceCents: 6000n, costCents: 1000n, cycle: 'MONTHLY', status: 'ACTIVE', startedAt: new Date('2026-01-01T12:00:00Z'), nextDueAt: new Date('2026-02-01T12:00:00Z') } });
      await db.charge.create({ data: { subscriptionId: sub.id, customerId: c.id, supplierId: supplierA.id, principalCents: BigInt((i + 1) * 1000), costCents: 100n, periodStart: new Date('2026-08-01'), periodEnd: new Date('2026-08-01'), dueAt: new Date('2026-08-15T23:59:59-03:00'), status: 'OPEN' } });
    }

    const result = await getCustomerBreakdown(from, to);

    const topIds = result.top.map((r) => r.id);
    const bottomIds = result.bottom.map((r) => r.id);
    expect(topIds.filter((id) => bottomIds.includes(id))).toHaveLength(0);
    expect(topIds.length + bottomIds.length).toBe(5);

    await db.charge.deleteMany({ where: { customerId: { in: customers.map((c) => c.id) } } });
    await db.subscription.deleteMany({ where: { customerId: { in: customers.map((c) => c.id) } } });
    await db.customer.deleteMany({ where: { id: { in: customers.map((c) => c.id) } } });
  });

  it('top tem no máximo 20 e bottom tem no máximo 20', async () => {
    const { supplierA, planA } = await seedMonthlyFixture();
    const { from, to } = monthBoundsUtc(2026, 7, TZ);
    const customers = await Promise.all(
      Array.from({ length: 45 }, (_, i) => db.customer.create({ data: { name: `Mês Teste Muitos ${i}`, phone: `+551188877${1000 + i}` } })),
    );
    for (const [i, c] of customers.entries()) {
      const sub = await db.subscription.create({ data: { customerId: c.id, planId: planA.id, supplierId: supplierA.id, priceCents: 6000n, costCents: 1000n, cycle: 'MONTHLY', status: 'ACTIVE', startedAt: new Date('2026-01-01T12:00:00Z'), nextDueAt: new Date('2026-02-01T12:00:00Z') } });
      await db.charge.create({ data: { subscriptionId: sub.id, customerId: c.id, supplierId: supplierA.id, principalCents: BigInt((i + 1) * 100), costCents: 50n, periodStart: new Date('2026-08-01'), periodEnd: new Date('2026-08-01'), dueAt: new Date('2026-08-15T23:59:59-03:00'), status: 'OPEN' } });
    }

    const result = await getCustomerBreakdown(from, to);

    expect(result.top).toHaveLength(20);
    expect(result.bottom).toHaveLength(20);
    const topIds = result.top.map((r) => r.id);
    const bottomIds = result.bottom.map((r) => r.id);
    expect(topIds.filter((id) => bottomIds.includes(id))).toHaveLength(0);

    await db.charge.deleteMany({ where: { customerId: { in: customers.map((c) => c.id) } } });
    await db.subscription.deleteMany({ where: { customerId: { in: customers.map((c) => c.id) } } });
    await db.customer.deleteMany({ where: { id: { in: customers.map((c) => c.id) } } });
  });
});

describe('getMonthlyTrend', () => {
  it('devolve 12 meses em ordem cronológica, cruzando virada de ano', async () => {
    // year=2026, month=1 (fevereiro, 0-indexed) → de março/2025 até fevereiro/2026.
    const rows = await getMonthlyTrend(2026, 1, TZ);

    expect(rows).toHaveLength(12);
    expect(rows[0]).toEqual(expect.objectContaining({ year: 2025, month: 2 })); // março/2025
    expect(rows[11]).toEqual(expect.objectContaining({ year: 2026, month: 1 })); // fevereiro/2026
  });

  it('cada mês soma billedCents/costCents do próprio mês', async () => {
    const { customer, supplierA, subA } = await seedMonthlyFixture();
    await db.charge.create({ data: { subscriptionId: subA.id, customerId: customer.id, supplierId: supplierA.id, principalCents: 6000n, costCents: 1000n, periodStart: new Date('2026-08-01'), periodEnd: new Date('2026-08-01'), dueAt: new Date('2026-08-15T23:59:59-03:00'), status: 'OPEN' } });

    const rows = await getMonthlyTrend(2026, 7, TZ); // termina em agosto/2026

    const august = rows.find((r) => r.year === 2026 && r.month === 7);
    expect(august?.billedCents).toBe('6000');
  });
});

describe('getDashboardKpis', () => {
  // O banco de integração é compartilhado e já tem linhas de outras suítes.
  // Por isso cada caso mede o baseline com os MESMOS parâmetros antes de semear
  // e afirma sobre o delta — nunca sobre o total absoluto.
  const TODAY_START = startOfLocalDay(2026, 7, 22, TZ); // 22/08/2026 00:00 em SP
  const TOMORROW_START = startOfLocalDay(2026, 7, 23, TZ);

  async function seedKpiFixture() {
    const supplier = await db.supplier.create({ data: { name: 'Fornecedor KPI', unitCostCents: 1000n } });
    const plan = await db.plan.create({ data: { name: 'Plano KPI', priceCents: 6000n, costCents: 1000n, cycle: 'MONTHLY' } });
    const customer = await db.customer.create({ data: { name: 'KPI Teste', phone: '+5511997770001' } });
    return { supplier, plan, customer };
  }

  async function createSubscription(
    customerId: string,
    supplierId: string,
    overrides: { priceCents?: bigint; costCents?: bigint; status?: SubscriptionStatus; cycle?: BillingCycle } = {},
  ) {
    return db.subscription.create({
      data: {
        customerId, supplierId,
        priceCents: overrides.priceCents ?? 6000n,
        costCents: overrides.costCents ?? 1000n,
        cycle: overrides.cycle ?? 'MONTHLY',
        status: overrides.status ?? 'ACTIVE',
        startedAt: new Date('2026-01-01T12:00:00Z'),
        nextDueAt: new Date('2026-02-01T12:00:00Z'),
      },
    });
  }

  async function createOpenCharge(
    subscriptionId: string, customerId: string, supplierId: string,
    overrides: { principalCents?: bigint; discountCents?: bigint; dueAt: Date; status?: ChargeStatus; periodStart: Date },
  ) {
    return db.charge.create({
      data: {
        subscriptionId, customerId, supplierId,
        principalCents: overrides.principalCents ?? 6000n,
        discountCents: overrides.discountCents ?? 0n,
        costCents: 1000n,
        periodStart: overrides.periodStart, periodEnd: overrides.periodStart,
        dueAt: overrides.dueAt,
        status: overrides.status ?? 'OPEN',
      },
    });
  }

  /** Idempotente, por chave natural. Roda antes E depois: o Postgres de
   *  integração é compartilhado e resíduo de um crash não se limpa sozinho —
   *  sem a purga prévia, o telefone da fixture derruba a execução seguinte. */
  async function purgeKpiFixture() {
    await db.payment.deleteMany({ where: { charge: { customer: { name: 'KPI Teste' } } } });
    await db.charge.deleteMany({ where: { customer: { name: 'KPI Teste' } } });
    await db.subscription.deleteMany({ where: { customer: { name: 'KPI Teste' } } });
    await db.customer.deleteMany({ where: { name: 'KPI Teste' } });
    await db.plan.deleteMany({ where: { name: 'Plano KPI' } });
    await db.supplier.deleteMany({ where: { name: 'Fornecedor KPI' } });
  }

  // Antes do baseline, nunca dentro do seed: baseline medido com resíduo e
  // apagado em seguida daria delta negativo.
  beforeEach(purgeKpiFixture);
  afterEach(purgeKpiFixture);

  it('vence hoje é 23:59:59 local, e um dia antes já é atraso', async () => {
    const before = await getDashboardKpis(TODAY_START, TOMORROW_START);
    const { customer, supplier } = await seedKpiFixture();
    // Índice parcial permite no máximo uma cobrança não-terminal por assinatura.
    const subToday = await createSubscription(customer.id, supplier.id);
    const subOverdue = await createSubscription(customer.id, supplier.id);
    const subFuture = await createSubscription(customer.id, supplier.id);
    await createOpenCharge(subToday.id, customer.id, supplier.id, {
      periodStart: new Date('2026-08-01'), dueAt: new Date('2026-08-22T23:59:59.999-03:00'), principalCents: 4500n,
    });
    await createOpenCharge(subOverdue.id, customer.id, supplier.id, {
      periodStart: new Date('2026-08-01'), dueAt: new Date('2026-08-21T23:59:59.999-03:00'), principalCents: 12000n, status: 'OVERDUE',
    });
    await createOpenCharge(subFuture.id, customer.id, supplier.id, {
      periodStart: new Date('2026-08-01'), dueAt: new Date('2026-08-25T23:59:59.999-03:00'), principalCents: 9900n,
    });

    const after = await getDashboardKpis(TODAY_START, TOMORROW_START);

    expect(after.dueTodayCount - before.dueTodayCount).toBe(1);
    expect(BigInt(after.dueTodayCents) - BigInt(before.dueTodayCents)).toBe(4500n);
    expect(after.overdueCount - before.overdueCount).toBe(1);
    expect(BigInt(after.overdueCents) - BigInt(before.overdueCents)).toBe(12000n);
  });

  it('valor é o líquido menos o que já entrou, nunca o principal cheio', async () => {
    const before = await getDashboardKpis(TODAY_START, TOMORROW_START);
    const { customer, supplier } = await seedKpiFixture();
    const sub = await createSubscription(customer.id, supplier.id);
    const charge = await createOpenCharge(sub.id, customer.id, supplier.id, {
      periodStart: new Date('2026-08-01'), dueAt: new Date('2026-08-22T23:59:59.999-03:00'),
      principalCents: 10000n, discountCents: 1000n, status: 'PARTIALLY_PAID',
    });
    await db.payment.create({ data: { chargeId: charge.id, amountCents: 3000n, paidAt: new Date('2026-08-20T12:00:00Z') } });

    const after = await getDashboardKpis(TODAY_START, TOMORROW_START);

    // 10000 principal - 1000 desconto - 3000 pago = 6000 a receber.
    expect(BigInt(after.dueTodayCents) - BigInt(before.dueTodayCents)).toBe(6000n);
  });

  it('1 centavo sobrevive à agregação sem virar float', async () => {
    const before = await getDashboardKpis(TODAY_START, TOMORROW_START);
    const { customer, supplier } = await seedKpiFixture();
    const sub = await createSubscription(customer.id, supplier.id);
    await createOpenCharge(sub.id, customer.id, supplier.id, {
      periodStart: new Date('2026-08-01'), dueAt: new Date('2026-08-22T23:59:59.999-03:00'), principalCents: 1n,
    });

    const after = await getDashboardKpis(TODAY_START, TOMORROW_START);

    expect(BigInt(after.dueTodayCents) - BigInt(before.dueTodayCents)).toBe(1n);
  });

  it('cobrança paga ou cancelada some da faixa de vencimentos', async () => {
    const before = await getDashboardKpis(TODAY_START, TOMORROW_START);
    const { customer, supplier } = await seedKpiFixture();
    const subPaid = await createSubscription(customer.id, supplier.id);
    const subCancelled = await createSubscription(customer.id, supplier.id);
    await createOpenCharge(subPaid.id, customer.id, supplier.id, {
      periodStart: new Date('2026-08-01'), dueAt: new Date('2026-08-22T23:59:59.999-03:00'), status: 'PAID',
    });
    await createOpenCharge(subCancelled.id, customer.id, supplier.id, {
      periodStart: new Date('2026-08-01'), dueAt: new Date('2026-08-21T23:59:59.999-03:00'), status: 'CANCELLED',
    });

    const after = await getDashboardKpis(TODAY_START, TOMORROW_START);

    expect(after.dueTodayCount).toBe(before.dueTodayCount);
    expect(after.overdueCount).toBe(before.overdueCount);
  });

  it('conta ativa e suspensa em contadores separados', async () => {
    const before = await getDashboardKpis(TODAY_START, TOMORROW_START);
    const { customer, supplier } = await seedKpiFixture();
    await createSubscription(customer.id, supplier.id, { status: 'ACTIVE' });
    await createSubscription(customer.id, supplier.id, { status: 'ACTIVE' });
    await createSubscription(customer.id, supplier.id, { status: 'SUSPENDED' });
    await createSubscription(customer.id, supplier.id, { status: 'CANCELLED' });

    const after = await getDashboardKpis(TODAY_START, TOMORROW_START);

    expect(after.activeSubscriptionsCount - before.activeSubscriptionsCount).toBe(2);
    expect(after.suspendedSubscriptionsCount - before.suspendedSubscriptionsCount).toBe(1);
  });

  it('margem média é a média das margens, não a margem da soma — anual não pesa 12x', async () => {
    const { customer, supplier } = await seedKpiFixture();
    // Mensal com margem 50% e anual com margem 10%. Média das margens = 30%.
    // Margem da soma seria (1000+12000-500-10800)/(1000+12000) ≈ 13%, número bem diferente.
    await createSubscription(customer.id, supplier.id, { priceCents: 1000n, costCents: 500n, cycle: 'MONTHLY' });
    await createSubscription(customer.id, supplier.id, { priceCents: 1200000n, costCents: 1080000n, cycle: 'ANNUAL' });

    const result = await getDashboardKpis(TODAY_START, TOMORROW_START);

    const active = await db.subscription.findMany({
      where: { status: 'ACTIVE', priceCents: { gt: 0n } },
      select: { priceCents: true, costCents: true },
    });
    const expected = active
      .reduce((acc, s) => acc.plus(marginPercent(s.priceCents, s.costCents)!), new Decimal(0))
      .div(active.length);

    expect(new Decimal(result.averageMarginPercent!).toFixed(6)).toBe(expected.toFixed(6));
  });

  it('assinatura sem preço não entra na média — divisão por zero não derruba o painel', async () => {
    const before = await getDashboardKpis(TODAY_START, TOMORROW_START);
    const { customer, supplier } = await seedKpiFixture();
    await createSubscription(customer.id, supplier.id, { priceCents: 0n, costCents: 0n });

    const after = await getDashboardKpis(TODAY_START, TOMORROW_START);

    expect(after.activeSubscriptionsCount - before.activeSubscriptionsCount).toBe(1);
    expect(after.averageMarginPercent).toBe(before.averageMarginPercent);
  });
});
