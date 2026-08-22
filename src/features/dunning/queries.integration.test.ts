import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  getDefaultRuleWithSteps,
  listOperatorAlerts,
  listRecentChargesForPreview,
  listDunningRules,
  listReviewMessages,
  NoDefaultDunningRuleError,
} from './queries';

/**
 * Purga idempotente por chave natural, no `beforeAll` **e** no `afterAll`, não
 * só entre testes: o Postgres de integração é compartilhado e a fixture usa um
 * telefone único. Um crash no meio da passada deixaria o `Customer` para trás e
 * todas as execuções seguintes morreriam em `Unique constraint failed (phone)`,
 * sem relação com o código sob teste.
 */
async function purge() {
  await db.dunningExecution.deleteMany({ where: { charge: { customer: { name: 'Preview Cliente' } } } });
  await db.charge.deleteMany({ where: { customer: { name: 'Preview Cliente' } } });
  await db.subscription.deleteMany({ where: { customer: { name: 'Preview Cliente' } } });
  await db.customer.deleteMany({ where: { name: 'Preview Cliente' } });
  await db.plan.deleteMany({ where: { name: 'Preview Plano' } });
  await db.supplier.deleteMany({ where: { name: 'Preview Fornecedor' } });
}

beforeAll(purge);
afterEach(purge);
afterAll(purge);

describe('getDefaultRuleWithSteps', () => {
  it('devolve a régua padrão seedada com os passos ordenados por offsetDays', async () => {
    const rule = await getDefaultRuleWithSteps();

    expect(rule.isDefault).toBe(true);
    expect(rule.steps.length).toBeGreaterThanOrEqual(6);
    const offsets = rule.steps.map((s) => s.offsetDays);
    expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
  });

  it('sem nenhuma régua padrão configurada, lança NoDefaultDunningRuleError com mensagem útil em vez de estourar', async () => {
    const rule = await db.dunningRule.findFirstOrThrow({ where: { isDefault: true } });
    await db.dunningRule.update({ where: { id: rule.id }, data: { isDefault: false } });

    let caught: unknown;
    try {
      await getDefaultRuleWithSteps();
    } catch (err) {
      caught = err;
    } finally {
      // Singleton usado por todo o resto da suite — restaura sempre, mesmo se a asserção falhar.
      await db.dunningRule.update({ where: { id: rule.id }, data: { isDefault: true } });
    }

    expect(caught).toBeInstanceOf(NoDefaultDunningRuleError);
    expect((caught as { code?: string }).code).toBe('NO_DEFAULT_DUNNING_RULE');
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

describe('listDunningRules', () => {
  it('lista as réguas com a contagem de passos, padrão primeiro', async () => {
    const rules = await listDunningRules();

    expect(rules.length).toBeGreaterThanOrEqual(1);
    expect(rules[0].isDefault).toBe(true);
    expect(rules[0].stepCount).toBeGreaterThanOrEqual(6);
  });
});

describe('listReviewMessages', () => {
  it('devolve o texto real da mensagem, e o cliente com duas cobranças vencidas aparece uma vez só', async () => {
    const rule = await db.dunningRule.findFirstOrThrow({ where: { isDefault: true } });
    const steps = await db.dunningStep.findMany({
      where: { ruleId: rule.id, action: 'SEND_MESSAGE' },
      orderBy: { offsetDays: 'asc' },
      take: 2,
    });
    const supplier = await db.supplier.create({ data: { name: 'Preview Fornecedor', unitCostCents: 1000n } });
    const plan = await db.plan.create({ data: { name: 'Preview Plano', priceCents: 6000n, costCents: 1000n, cycle: 'MONTHLY' } });
    const customer = await db.customer.create({ data: { name: 'Preview Cliente', phone: '+5562990000042' } });

    // Duas assinaturas do mesmo cliente: o índice único parcial só permite uma
    // cobrança em aberto por assinatura, e o caso que importa aqui é o cliente
    // com mais de uma cobrança vencida.
    for (const [index, step] of steps.entries()) {
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
      const charge = await db.charge.create({
        data: {
          subscriptionId: subscription.id,
          customerId: customer.id,
          supplierId: supplier.id,
          principalCents: 6000n,
          periodStart: new Date(2026, 0, 1 + index),
          periodEnd: new Date(2026, 0, 28 + index),
          dueAt: new Date(),
          status: 'OPEN',
        },
      });
      await db.dunningExecution.create({ data: { chargeId: charge.id, stepId: step.id, outcome: 'PENDING_REVIEW', reason: 'review' } });
    }

    const preview = await listReviewMessages(rule.id);

    const forCustomer = preview.filter((entry) => entry.customerId === customer.id);
    expect(forCustomer).toHaveLength(1);
    expect(forCustomer[0].customerName).toBe('Preview Cliente');
    // Texto real, com as variáveis já substituídas — nada de `{{` sobrando.
    expect(forCustomer[0].body).toContain('Preview');
    expect(forCustomer[0].body).not.toContain('{{');
    // Consolidada: a segunda cobrança entra como sufixo, não como segunda linha.
    expect(forCustomer[0].body).toContain('+ mais 1 cobrança(s)');
  });
});

describe('listOperatorAlerts', () => {
  it('nunca lança mesmo sem nenhum alerta recente', async () => {
    const alerts = await listOperatorAlerts();
    expect(Array.isArray(alerts)).toBe(true);
  });
});
