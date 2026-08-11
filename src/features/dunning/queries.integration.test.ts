import { afterEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  getDefaultRuleWithSteps,
  listOperatorAlerts,
  listRecentChargesForPreview,
  listReviewPreview,
} from './queries';

afterEach(async () => {
  await db.dunningExecution.deleteMany({ where: { charge: { customer: { name: 'Preview Cliente' } } } });
  await db.charge.deleteMany({ where: { customer: { name: 'Preview Cliente' } } });
  await db.subscription.deleteMany({ where: { customer: { name: 'Preview Cliente' } } });
  await db.customer.deleteMany({ where: { name: 'Preview Cliente' } });
  await db.plan.deleteMany({ where: { name: 'Preview Plano' } });
  await db.supplier.deleteMany({ where: { name: 'Preview Fornecedor' } });
});

describe('getDefaultRuleWithSteps', () => {
  it('devolve a régua padrão seedada com os passos ordenados por offsetDays', async () => {
    const rule = await getDefaultRuleWithSteps();

    expect(rule.isDefault).toBe(true);
    expect(rule.steps.length).toBeGreaterThanOrEqual(6);
    const offsets = rule.steps.map((s) => s.offsetDays);
    expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
  });
});

describe('listRecentChargesForPreview', () => {
  it('nunca estoura mesmo sem nenhuma cobrança no banco além das existentes, e respeita o limite', async () => {
    const rows = await listRecentChargesForPreview(2);
    expect(rows.length).toBeLessThanOrEqual(2);
    if (rows.length > 0) {
      expect(rows[0]).toHaveProperty('customerName');
      expect(rows[0]).toHaveProperty('netCents');
      expect(rows[0]).toHaveProperty('dueAt');
    }
  });
});

describe('listReviewPreview', () => {
  it('agrupa DunningExecution PENDING_REVIEW por passo', async () => {
    const rule = await db.dunningRule.findFirstOrThrow({ where: { isDefault: true } });
    const step = await db.dunningStep.findFirstOrThrow({ where: { ruleId: rule.id } });
    const supplier = await db.supplier.create({ data: { name: 'Preview Fornecedor', unitCostCents: 1000n } });
    const plan = await db.plan.create({ data: { name: 'Preview Plano', priceCents: 6000n, costCents: 1000n, cycle: 'MONTHLY' } });
    const customer = await db.customer.create({ data: { name: 'Preview Cliente' } });
    const subscription = await db.subscription.create({ data: { customerId: customer.id, planId: plan.id, supplierId: supplier.id, priceCents: 6000n, costCents: 1000n, cycle: 'MONTHLY', status: 'ACTIVE', startedAt: new Date(), nextDueAt: new Date() } });
    const charge = await db.charge.create({ data: { subscriptionId: subscription.id, customerId: customer.id, supplierId: supplier.id, principalCents: 6000n, periodStart: new Date(), periodEnd: new Date(), dueAt: new Date(), status: 'OPEN' } });
    await db.dunningExecution.create({ data: { chargeId: charge.id, stepId: step.id, outcome: 'PENDING_REVIEW', reason: 'review' } });

    const preview = await listReviewPreview();

    const entry = preview.find((p) => p.stepId === step.id);
    expect(entry?.count).toBeGreaterThanOrEqual(1);
  });
});

describe('listOperatorAlerts', () => {
  it('nunca lança mesmo sem nenhum alerta recente', async () => {
    const alerts = await listOperatorAlerts();
    expect(Array.isArray(alerts)).toBe(true);
  });
});
