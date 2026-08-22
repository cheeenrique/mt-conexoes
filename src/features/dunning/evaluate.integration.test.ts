import { afterEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { evaluateDunningRule } from './evaluate';

const NOW = new Date('2026-08-10T12:00:00-03:00');

async function seedFixture(overrides: { optedOut?: boolean; phone?: string | null } = {}) {
  const supplier = await db.supplier.create({ data: { name: 'Fornecedor Teste', unitCostCents: 1000n } });
  const plan = await db.plan.create({ data: { name: 'Plano Teste', priceCents: 6000n, costCents: 1000n, cycle: 'MONTHLY' } });
  const phone = 'phone' in overrides ? overrides.phone : '+5511999990100';
  const customer = await db.customer.create({ data: { name: 'Dunning Teste', phone, optedOut: overrides.optedOut ?? false } });
  const subscription = await db.subscription.create({
    data: { customerId: customer.id, planId: plan.id, supplierId: supplier.id, priceCents: 6000n, costCents: 1000n, cycle: 'MONTHLY', status: 'ACTIVE', startedAt: NOW, nextDueAt: NOW },
  });
  // vence hoje (offsetDays 0 no seed padrão)
  const charge = await db.charge.create({
    data: { subscriptionId: subscription.id, customerId: customer.id, supplierId: supplier.id, principalCents: 6000n, periodStart: NOW, periodEnd: NOW, dueAt: new Date('2026-08-10T23:59:59-03:00'), status: 'OPEN' },
  });
  return { customer, subscription, charge };
}

afterEach(async () => {
  await db.dunningExecution.deleteMany({ where: { charge: { customer: { name: 'Dunning Teste' } } } });
  await db.message.deleteMany({ where: { customer: { name: 'Dunning Teste' } } });
  await db.charge.deleteMany({ where: { customer: { name: 'Dunning Teste' } } });
  await db.subscription.deleteMany({ where: { customer: { name: 'Dunning Teste' } } });
  await db.customer.deleteMany({ where: { name: 'Dunning Teste' } });
  await db.plan.deleteMany({ where: { name: 'Plano Teste' } });
  await db.supplier.deleteMany({ where: { name: 'Fornecedor Teste' } });
});

describe('evaluateDunningRule', () => {
  it('régua em DRAFT não avalia nada: zero DunningExecution, zero Message, contadores zerados', async () => {
    await db.dunningRule.updateMany({ where: { isDefault: true }, data: { status: 'DRAFT' } });
    const { customer, charge } = await seedFixture();

    const result = await evaluateDunningRule(NOW, false);

    expect(result).toEqual({ queued: 0, skipped: 0, pendingReview: 0, suspended: 0 });
    const executions = await db.dunningExecution.findMany({ where: { chargeId: charge.id } });
    expect(executions).toHaveLength(0);
    const messages = await db.message.findMany({ where: { customerId: customer.id } });
    expect(messages).toHaveLength(0);
  });

  it('régua em PAUSED não avalia nada: zero DunningExecution, zero Message, contadores zerados', async () => {
    await db.dunningRule.updateMany({ where: { isDefault: true }, data: { status: 'PAUSED' } });
    const { customer, charge } = await seedFixture();

    const result = await evaluateDunningRule(NOW, false);

    expect(result).toEqual({ queued: 0, skipped: 0, pendingReview: 0, suspended: 0 });
    const executions = await db.dunningExecution.findMany({ where: { chargeId: charge.id } });
    expect(executions).toHaveLength(0);
    const messages = await db.message.findMany({ where: { customerId: customer.id } });
    expect(messages).toHaveLength(0);
  });

  it('régua em REVIEW gera PENDING_REVIEW, zero Message', async () => {
    await db.dunningRule.updateMany({ where: { isDefault: true }, data: { status: 'REVIEW' } });
    const { customer, charge } = await seedFixture();

    await evaluateDunningRule(NOW, false);

    const executions = await db.dunningExecution.findMany({ where: { chargeId: charge.id } });
    expect(executions).toHaveLength(1);
    expect(executions[0].outcome).toBe('PENDING_REVIEW');
    const messages = await db.message.findMany({ where: { customerId: customer.id } });
    expect(messages).toHaveLength(0);
  });

  it('régua ACTIVE, cliente optedOut: SKIPPED reason=opted_out, zero Message', async () => {
    await db.dunningRule.updateMany({ where: { isDefault: true }, data: { status: 'ACTIVE' } });
    const { customer, charge } = await seedFixture({ optedOut: true });

    await evaluateDunningRule(NOW, false);

    const executions = await db.dunningExecution.findMany({ where: { chargeId: charge.id } });
    expect(executions).toHaveLength(1);
    expect(executions[0].outcome).toBe('SKIPPED');
    expect(executions[0].reason).toBe('opted_out');
    const messages = await db.message.findMany({ where: { customerId: customer.id } });
    expect(messages).toHaveLength(0);
  });

  it('régua ACTIVE, canal exige template aprovado e o passo não tem metaTemplateName: SKIPPED reason=template_not_approved, zero Message', async () => {
    await db.dunningRule.updateMany({ where: { isDefault: true }, data: { status: 'ACTIVE' } });
    const { customer, charge } = await seedFixture();

    await evaluateDunningRule(NOW, true);

    const executions = await db.dunningExecution.findMany({ where: { chargeId: charge.id } });
    expect(executions).toHaveLength(1);
    expect(executions[0].outcome).toBe('SKIPPED');
    expect(executions[0].reason).toBe('template_not_approved');
    const messages = await db.message.findMany({ where: { customerId: customer.id } });
    expect(messages).toHaveLength(0);
  });

  it('régua ACTIVE, canal exige template aprovado mas o passo já tem metaTemplateName: segue normalmente, sem SKIPPED', async () => {
    await db.dunningRule.updateMany({ where: { isDefault: true }, data: { status: 'ACTIVE' } });
    const rule = await db.dunningRule.findFirstOrThrow({ where: { isDefault: true } });
    const step = await db.dunningStep.findFirstOrThrow({ where: { ruleId: rule.id, offsetDays: 0 } });
    await db.dunningStep.update({ where: { id: step.id }, data: { metaTemplateName: 'renovacao_hoje' } });
    const { customer, charge } = await seedFixture();

    try {
      await evaluateDunningRule(NOW, true);

      const executions = await db.dunningExecution.findMany({ where: { chargeId: charge.id } });
      expect(executions).toHaveLength(1);
      expect(executions[0].outcome).toBe('QUEUED');
      expect(executions[0].reason).toBeNull();
      const messages = await db.message.findMany({ where: { customerId: customer.id } });
      expect(messages).toHaveLength(1);
    } finally {
      await db.dunningStep.update({ where: { id: step.id }, data: { metaTemplateName: null } });
    }
  });

  it('régua ACTIVE, sem telefone: SKIPPED reason=no_phone', async () => {
    await db.dunningRule.updateMany({ where: { isDefault: true }, data: { status: 'ACTIVE' } });
    const { charge } = await seedFixture({ phone: null });

    await evaluateDunningRule(NOW, false);

    const executions = await db.dunningExecution.findMany({ where: { chargeId: charge.id } });
    expect(executions[0].outcome).toBe('SKIPPED');
    expect(executions[0].reason).toBe('no_phone');
  });

  it('rodar duas vezes no mesmo dia não duplica DunningExecution (idempotência real)', async () => {
    await db.dunningRule.updateMany({ where: { isDefault: true }, data: { status: 'ACTIVE' } });
    const { charge } = await seedFixture();

    await evaluateDunningRule(NOW, false);
    await evaluateDunningRule(NOW, false);

    const executions = await db.dunningExecution.findMany({ where: { chargeId: charge.id } });
    expect(executions).toHaveLength(1);
  });

  it('cliente com 2 cobranças no mesmo passo: 1 Message, 2 DunningExecution apontando pro mesmo messageId', async () => {
    await db.dunningRule.updateMany({ where: { isDefault: true }, data: { status: 'ACTIVE' } });
    const { customer, charge } = await seedFixture();
    const supplier = await db.supplier.findFirstOrThrow({ where: { name: 'Fornecedor Teste' } });
    const plan = await db.plan.findFirstOrThrow({ where: { name: 'Plano Teste' } });
    // segunda assinatura pro mesmo cliente — uma Charge OPEN por subscription é o máximo (índice parcial)
    const subscription2 = await db.subscription.create({
      data: { customerId: customer.id, planId: plan.id, supplierId: supplier.id, priceCents: 4000n, costCents: 500n, cycle: 'MONTHLY', status: 'ACTIVE', startedAt: NOW, nextDueAt: NOW },
    });
    const charge2 = await db.charge.create({
      data: { subscriptionId: subscription2.id, customerId: customer.id, supplierId: supplier.id, principalCents: 4000n, periodStart: NOW, periodEnd: NOW, dueAt: new Date('2026-08-10T23:59:59-03:00'), status: 'OPEN' },
    });

    await evaluateDunningRule(NOW, false);

    const messages = await db.message.findMany({ where: { customerId: customer.id } });
    expect(messages).toHaveLength(1);
    expect(messages[0].toPhone).toBe('+5511999990100');

    const executionsCharge1 = await db.dunningExecution.findMany({ where: { chargeId: charge.id } });
    const executionsCharge2 = await db.dunningExecution.findMany({ where: { chargeId: charge2.id } });
    expect(executionsCharge1).toHaveLength(1);
    expect(executionsCharge2).toHaveLength(1);
    expect(executionsCharge1[0].messageId).toBe(messages[0].id);
    expect(executionsCharge2[0].messageId).toBe(messages[0].id);
  });

  it('passo SUSPEND transiciona Subscription.status, sem Message', async () => {
    await db.dunningRule.updateMany({ where: { isDefault: true }, data: { status: 'ACTIVE' } });
    const { customer, subscription, charge } = await seedFixture();
    await db.charge.update({ where: { id: charge.id }, data: { dueAt: new Date('2026-08-05T23:59:59-03:00') } });

    await evaluateDunningRule(new Date('2026-08-10T12:00:00-03:00'), false);

    const refreshedSub = await db.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
    expect(refreshedSub.status).toBe('SUSPENDED');
    const messages = await db.message.findMany({ where: { customerId: customer.id } });
    expect(messages).toHaveLength(0);
  });

  it('T7: customer já mensageado hoje — passo novo vira DunningExecution SKIPPED reason=daily_dedupe', async () => {
    await db.dunningRule.updateMany({ where: { isDefault: true }, data: { status: 'ACTIVE' } });
    const { customer, charge } = await seedFixture();
    await db.message.create({
      data: {
        customerId: customer.id,
        kind: 'DUNNING',
        status: 'PENDING',
        toPhone: customer.phone as string,
        body: 'Mensagem já enviada hoje.',
        scheduledFor: NOW,
        scheduledDate: new Date('2026-08-10T00:00:00.000Z'),
      },
    });

    await evaluateDunningRule(NOW, false);

    const executions = await db.dunningExecution.findMany({ where: { chargeId: charge.id } });
    expect(executions).toHaveLength(1);
    expect(executions[0].outcome).toBe('SKIPPED');
    expect(executions[0].reason).toBe('daily_dedupe');
  });
});
