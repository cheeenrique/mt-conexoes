import { afterEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  createStep,
  updateStep,
  deleteStep,
  activateDunningRule,
  UnknownTemplateVariableError,
  DuplicateStepOffsetError,
  DunningRuleNotInReviewError,
} from './service';

let ruleId: string;
let activateTestSubscriptionId: string | undefined;
let activateTestCustomerId: string | undefined;
let activateTestPlanId: string | undefined;
let activateTestSupplierId: string | undefined;

afterEach(async () => {
  await db.dunningStep.deleteMany({ where: { offsetDays: { in: [-42, 42, 43] } } });

  if (activateTestSubscriptionId) {
    await db.charge.deleteMany({ where: { subscriptionId: activateTestSubscriptionId } });
    await db.subscription.delete({ where: { id: activateTestSubscriptionId } });
    activateTestSubscriptionId = undefined;
  }
  if (activateTestCustomerId) {
    await db.customer.delete({ where: { id: activateTestCustomerId } });
    activateTestCustomerId = undefined;
  }
  if (activateTestPlanId) {
    await db.plan.delete({ where: { id: activateTestPlanId } });
    activateTestPlanId = undefined;
  }
  if (activateTestSupplierId) {
    await db.supplier.delete({ where: { id: activateTestSupplierId } });
    activateTestSupplierId = undefined;
  }
});

describe('createStep', () => {
  it('rejeita variável desconhecida antes de tocar o banco', async () => {
    const rule = await db.dunningRule.findFirstOrThrow({ where: { isDefault: true } });
    ruleId = rule.id;

    await expect(
      createStep(ruleId, { days: 42, direction: 'after', action: 'SEND_MESSAGE', templateBody: 'Olá {{cliente.apelido}}', isActive: true }),
    ).rejects.toThrow(UnknownTemplateVariableError);

    const created = await db.dunningStep.findFirst({ where: { ruleId, offsetDays: 42 } });
    expect(created).toBeNull();
  });

  it('"antes do vencimento" grava deslocamento negativo — o sinal não é digitado', async () => {
    const rule = await db.dunningRule.findFirstOrThrow({ where: { isDefault: true } });

    const step = await createStep(rule.id, {
      days: 42,
      direction: 'before',
      action: 'SEND_MESSAGE',
      templateBody: 'Olá {{negocio.nome}}',
      isActive: true,
    });

    expect(step.offsetDays).toBe(-42);
  });

  it('cria passo com template válido', async () => {
    const rule = await db.dunningRule.findFirstOrThrow({ where: { isDefault: true } });
    ruleId = rule.id;

    const step = await createStep(ruleId, { days: 43, direction: 'after', action: 'SEND_MESSAGE', templateBody: 'Olá {{cliente.primeiro_nome}}', isActive: true });

    expect(step.offsetDays).toBe(43);
  });

  it('dois passos com o mesmo offsetDays na mesma régua batem na constraint do banco', async () => {
    const rule = await db.dunningRule.findFirstOrThrow({ where: { isDefault: true } });
    ruleId = rule.id;

    await createStep(ruleId, { days: 42, direction: 'after', action: 'SEND_MESSAGE', templateBody: 'Olá {{negocio.nome}}', isActive: true });

    await expect(
      createStep(ruleId, { days: 42, direction: 'after', action: 'SEND_MESSAGE', templateBody: 'Outro {{negocio.nome}}', isActive: true }),
    ).rejects.toThrow(DuplicateStepOffsetError);
  });
});

describe('updateStep', () => {
  it('re-valida o template ao atualizar', async () => {
    const rule = await db.dunningRule.findFirstOrThrow({ where: { isDefault: true } });
    const step = await createStep(rule.id, { days: 42, direction: 'after', action: 'SEND_MESSAGE', templateBody: 'Olá {{negocio.nome}}', isActive: true });

    await expect(
      updateStep(step.id, { days: 42, direction: 'after', action: 'SEND_MESSAGE', templateBody: 'Olá {{variavel.inexistente}}', isActive: true }),
    ).rejects.toThrow(UnknownTemplateVariableError);
  });
});

describe('deleteStep', () => {
  it('remove o passo', async () => {
    const rule = await db.dunningRule.findFirstOrThrow({ where: { isDefault: true } });
    const step = await createStep(rule.id, { days: 42, direction: 'after', action: 'SEND_MESSAGE', templateBody: 'Olá {{negocio.nome}}', isActive: true });

    await deleteStep(step.id);

    const found = await db.dunningStep.findUnique({ where: { id: step.id } });
    expect(found).toBeNull();
  });
});

describe('activateDunningRule', () => {
  it('rejeita DRAFT → ACTIVE direto, sem passar por revisão', async () => {
    const rule = await db.dunningRule.findFirstOrThrow({ where: { isDefault: true } });
    await db.dunningRule.update({ where: { id: rule.id }, data: { status: 'DRAFT' } });

    await expect(activateDunningRule(rule.id, 'send-all')).rejects.toThrow(DunningRuleNotInReviewError);

    const refreshed = await db.dunningRule.findUniqueOrThrow({ where: { id: rule.id } });
    expect(refreshed.status).toBe('DRAFT');
  });

  it('send-all: muda status pra ACTIVE, mantém PENDING_REVIEW existentes', async () => {
    const rule = await db.dunningRule.findFirstOrThrow({ where: { isDefault: true } });
    await db.dunningRule.update({ where: { id: rule.id }, data: { status: 'REVIEW' } });

    await activateDunningRule(rule.id, 'send-all');

    const refreshed = await db.dunningRule.findUniqueOrThrow({ where: { id: rule.id } });
    expect(refreshed.status).toBe('ACTIVE');
  });

  it('ignore-retroactive: apaga PENDING_REVIEW existentes, mantém QUEUED/SKIPPED, ativa a régua', async () => {
    const rule = await db.dunningRule.findFirstOrThrow({ where: { isDefault: true } });
    const step = await db.dunningStep.findFirstOrThrow({ where: { ruleId: rule.id } });
    await db.dunningRule.update({ where: { id: rule.id }, data: { status: 'REVIEW' } });

    const supplier = await db.supplier.create({ data: { name: 'Ativa Fornecedor', unitCostCents: 1000n } });
    const plan = await db.plan.create({ data: { name: 'Ativa Plano', priceCents: 6000n, costCents: 1000n, cycle: 'MONTHLY' } });
    const customer = await db.customer.create({ data: { name: 'Ativa Cliente' } });
    const subscription = await db.subscription.create({
      data: {
        customerId: customer.id,
        planId: plan.id,
        supplierId: supplier.id,
        priceCents: 6000n,
        costCents: 1000n,
        cycle: 'MONTHLY',
        status: 'ACTIVE',
        startedAt: new Date(),
        nextDueAt: new Date(),
      },
    });
    activateTestSupplierId = supplier.id;
    activateTestPlanId = plan.id;
    activateTestCustomerId = customer.id;
    activateTestSubscriptionId = subscription.id;

    const chargeReview = await db.charge.create({
      data: { subscriptionId: subscription.id, customerId: customer.id, supplierId: supplier.id, principalCents: 6000n, periodStart: new Date('2026-01-01'), periodEnd: new Date('2026-01-31'), dueAt: new Date(), status: 'OPEN' },
    });
    const chargeQueued = await db.charge.create({
      data: { subscriptionId: subscription.id, customerId: customer.id, supplierId: supplier.id, principalCents: 6000n, periodStart: new Date('2026-02-01'), periodEnd: new Date('2026-02-28'), dueAt: new Date(), status: 'PAID' },
    });
    const executionReview = await db.dunningExecution.create({ data: { chargeId: chargeReview.id, stepId: step.id, outcome: 'PENDING_REVIEW', reason: 'review' } });
    const executionQueued = await db.dunningExecution.create({ data: { chargeId: chargeQueued.id, stepId: step.id, outcome: 'QUEUED', reason: 'queued' } });

    await activateDunningRule(rule.id, 'ignore-retroactive');

    const refreshedRule = await db.dunningRule.findUniqueOrThrow({ where: { id: rule.id } });
    expect(refreshedRule.status).toBe('ACTIVE');

    const stillThere = await db.dunningExecution.findUnique({ where: { id: executionReview.id } });
    expect(stillThere).toBeNull();

    const queuedStillThere = await db.dunningExecution.findUnique({ where: { id: executionQueued.id } });
    expect(queuedStillThere).not.toBeNull();
  });
});
