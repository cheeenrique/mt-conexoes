import { afterEach, describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { evaluateDunningRule } from './evaluate';

const NOW = new Date('2026-08-10T12:00:00-03:00');

async function seedFixture(
  overrides: { optedOut?: boolean; phone?: string | null; anonymizedAt?: Date; deletedAt?: Date; dueAt?: Date } = {},
) {
  const supplier = await db.supplier.create({ data: { name: 'Fornecedor Teste', unitCostCents: 1000n } });
  const plan = await db.plan.create({ data: { name: 'Plano Teste', priceCents: 6000n, costCents: 1000n, cycle: 'MONTHLY' } });
  const phone = 'phone' in overrides ? overrides.phone : '+5511999990100';
  const customer = await db.customer.create({
    data: {
      name: 'Dunning Teste',
      phone,
      optedOut: overrides.optedOut ?? false,
      anonymizedAt: overrides.anonymizedAt,
      deletedAt: overrides.deletedAt,
    },
  });
  const subscription = await db.subscription.create({
    data: { customerId: customer.id, planId: plan.id, supplierId: supplier.id, priceCents: 6000n, costCents: 1000n, cycle: 'MONTHLY', status: 'ACTIVE', startedAt: NOW, nextDueAt: NOW },
  });
  // vence hoje (offsetDays 0 no seed padrão)
  const charge = await db.charge.create({
    data: { subscriptionId: subscription.id, customerId: customer.id, supplierId: supplier.id, principalCents: 6000n, periodStart: NOW, periodEnd: NOW, dueAt: overrides.dueAt ?? new Date('2026-08-10T23:59:59-03:00'), status: 'OPEN' },
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
  // Reseta o carimbo da régua padrão pra não vazar entre testes deste arquivo
  // (o Postgres de integração é compartilhado — ver memória de antipadrões).
  await db.dunningRule.updateMany({
    where: { isDefault: true },
    data: { lastRunAt: null, lastRunMessagesSent: null, lastRunPendingReview: null },
  });
});

describe('evaluateDunningRule', () => {
  it('régua em DRAFT não avalia nada: zero DunningExecution, zero Message, contadores zerados, sem carimbo de passada', async () => {
    await db.dunningRule.updateMany({ where: { isDefault: true }, data: { status: 'DRAFT' } });
    const { customer, charge } = await seedFixture();

    const result = await evaluateDunningRule(NOW, false);

    expect(result).toEqual({ queued: 0, skipped: 0, pendingReview: 0, suspended: 0 });
    const executions = await db.dunningExecution.findMany({ where: { chargeId: charge.id } });
    expect(executions).toHaveLength(0);
    const messages = await db.message.findMany({ where: { customerId: customer.id } });
    expect(messages).toHaveLength(0);
    // "Rascunho: o motor nem avalia esta régua" — sem passada, sem carimbo.
    const rule = await db.dunningRule.findFirstOrThrow({ where: { isDefault: true } });
    expect(rule.lastRunAt).toBeNull();
  });

  it('régua em PAUSED não avalia nada: zero DunningExecution, zero Message, contadores zerados, sem carimbo de passada', async () => {
    await db.dunningRule.updateMany({ where: { isDefault: true }, data: { status: 'PAUSED' } });
    const { customer, charge } = await seedFixture();

    const result = await evaluateDunningRule(NOW, false);

    expect(result).toEqual({ queued: 0, skipped: 0, pendingReview: 0, suspended: 0 });
    const executions = await db.dunningExecution.findMany({ where: { chargeId: charge.id } });
    expect(executions).toHaveLength(0);
    const messages = await db.message.findMany({ where: { customerId: customer.id } });
    expect(messages).toHaveLength(0);
    // "Pausada: nada sai por esta régua" — não roda, então não atualiza o carimbo
    // (a tela continua mostrando a última passada de antes de pausar).
    const rule = await db.dunningRule.findFirstOrThrow({ where: { isDefault: true } });
    expect(rule.lastRunAt).toBeNull();
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

  // Defesa em profundidade (LGPD): não deveria existir cobrança em aberto de
  // cliente anonimizado (a trava de anonimizar bloqueia isso), mas se uma
  // linha escapar, este guard é o que impede a régua de mandar mensagem.
  it('régua ACTIVE, cliente anonymizedAt: SKIPPED reason=customer_anonymized, zero Message', async () => {
    await db.dunningRule.updateMany({ where: { isDefault: true }, data: { status: 'ACTIVE' } });
    const { customer, charge } = await seedFixture({ anonymizedAt: new Date('2026-08-01T12:00:00Z') });

    await evaluateDunningRule(NOW, false);

    const executions = await db.dunningExecution.findMany({ where: { chargeId: charge.id } });
    expect(executions).toHaveLength(1);
    expect(executions[0].outcome).toBe('SKIPPED');
    expect(executions[0].reason).toBe('customer_anonymized');
    const messages = await db.message.findMany({ where: { customerId: customer.id } });
    expect(messages).toHaveLength(0);
  });

  // Soft delete ("Remover" na tabela): cliente saiu da lista, régua para de
  // cobrar também — senão a mensagem sai pra alguém que o operador não
  // consegue mais achar na tela pra acompanhar.
  it('régua ACTIVE, cliente deletedAt: SKIPPED reason=customer_deleted, zero Message', async () => {
    await db.dunningRule.updateMany({ where: { isDefault: true }, data: { status: 'ACTIVE' } });
    const { customer, charge } = await seedFixture({ deletedAt: new Date('2026-08-01T12:00:00Z') });

    await evaluateDunningRule(NOW, false);

    const executions = await db.dunningExecution.findMany({ where: { chargeId: charge.id } });
    expect(executions).toHaveLength(1);
    expect(executions[0].outcome).toBe('SKIPPED');
    expect(executions[0].reason).toBe('customer_deleted');
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

  it('régua ACTIVE, canal exige template aprovado mas o passo já tem metaTemplateName: segue normalmente, Message congela template e parâmetros posicionais', async () => {
    await db.dunningRule.updateMany({ where: { isDefault: true }, data: { status: 'ACTIVE' } });
    const rule = await db.dunningRule.findFirstOrThrow({ where: { isDefault: true } });
    const step = await db.dunningStep.findFirstOrThrow({ where: { ruleId: rule.id, offsetDays: 0 } });
    // Ordem derivada da 1ª aparição de cada variável no templateBody do seed (D0):
    // "Olá {{cliente.primeiro_nome}}! ... {{cobranca.valor}} vence hoje ({{cobranca.vencimento}}).
    //  Pix: {{pix.chave}} ... {{negocio.nome}}" — o que `orderedTemplateParamKeys` produziria de verdade.
    await db.dunningStep.update({
      where: { id: step.id },
      data: {
        metaTemplateName: 'renovacao_hoje',
        metaTemplateParams: ['cliente.primeiro_nome', 'cobranca.valor', 'cobranca.vencimento', 'pix.chave', 'negocio.nome'],
      },
    });
    const { customer, charge } = await seedFixture();

    try {
      await evaluateDunningRule(NOW, true);

      const executions = await db.dunningExecution.findMany({ where: { chargeId: charge.id } });
      expect(executions).toHaveLength(1);
      expect(executions[0].outcome).toBe('QUEUED');
      expect(executions[0].reason).toBeNull();
      const messages = await db.message.findMany({ where: { customerId: customer.id } });
      expect(messages).toHaveLength(1);
      expect(messages[0].templateName).toBe('renovacao_hoje');
      expect(messages[0].templateParams).toEqual({
        '1': 'Dunning', // primeiro nome do fixture "Dunning Teste"
        '2': 'R$ 60,00',
        '3': '10/08/2026',
        '4': '',
        '5': 'MT Conexões',
      });
    } finally {
      await db.dunningStep.update({ where: { id: step.id }, data: { metaTemplateName: null, metaTemplateParams: Prisma.DbNull } });
    }
  });

  it('régua ACTIVE, canal exige template aprovado, cliente com 2 cobranças (consolidação): zero Message, SKIPPED reason=consolidation_template_missing pras duas', async () => {
    await db.dunningRule.updateMany({ where: { isDefault: true }, data: { status: 'ACTIVE' } });
    const rule = await db.dunningRule.findFirstOrThrow({ where: { isDefault: true } });
    const step = await db.dunningStep.findFirstOrThrow({ where: { ruleId: rule.id, offsetDays: 0 } });
    await db.dunningStep.update({
      where: { id: step.id },
      data: { metaTemplateName: 'renovacao_hoje', metaTemplateParams: ['cliente.primeiro_nome'] },
    });
    const { customer, charge } = await seedFixture();
    const supplier = await db.supplier.findFirstOrThrow({ where: { name: 'Fornecedor Teste' } });
    const plan = await db.plan.findFirstOrThrow({ where: { name: 'Plano Teste' } });
    const subscription2 = await db.subscription.create({
      data: { customerId: customer.id, planId: plan.id, supplierId: supplier.id, priceCents: 4000n, costCents: 500n, cycle: 'MONTHLY', status: 'ACTIVE', startedAt: NOW, nextDueAt: NOW },
    });
    const charge2 = await db.charge.create({
      data: { subscriptionId: subscription2.id, customerId: customer.id, supplierId: supplier.id, principalCents: 4000n, periodStart: NOW, periodEnd: NOW, dueAt: new Date('2026-08-10T23:59:59-03:00'), status: 'OPEN' },
    });

    try {
      await evaluateDunningRule(NOW, true);

      const messages = await db.message.findMany({ where: { customerId: customer.id } });
      expect(messages).toHaveLength(0);

      const executionsCharge1 = await db.dunningExecution.findMany({ where: { chargeId: charge.id } });
      const executionsCharge2 = await db.dunningExecution.findMany({ where: { chargeId: charge2.id } });
      expect(executionsCharge1).toHaveLength(1);
      expect(executionsCharge2).toHaveLength(1);
      expect(executionsCharge1[0].outcome).toBe('SKIPPED');
      expect(executionsCharge1[0].reason).toBe('consolidation_template_missing');
      expect(executionsCharge2[0].outcome).toBe('SKIPPED');
      expect(executionsCharge2[0].reason).toBe('consolidation_template_missing');
    } finally {
      await db.dunningStep.update({ where: { id: step.id }, data: { metaTemplateName: null, metaTemplateParams: Prisma.DbNull } });
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

  it('passo SUSPEND transiciona Subscription.status e não produz Message própria', async () => {
    await db.dunningRule.updateMany({ where: { isDefault: true }, data: { status: 'ACTIVE' } });
    const { subscription, charge } = await seedFixture();
    await db.charge.update({ where: { id: charge.id }, data: { dueAt: new Date('2026-08-05T23:59:59-03:00') } });

    await evaluateDunningRule(new Date('2026-08-10T12:00:00-03:00'), false);

    const refreshedSub = await db.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
    expect(refreshedSub.status).toBe('SUSPENDED');
    // `suspendedAt` é o "desde quando" do relatório de suspensas e da reativação.
    // A suspensão manual (`statusPatch`) sempre datou; a da régua não datava,
    // então o relatório mostrava suspensa sem data de corte.
    expect(refreshedSub.suspendedAt?.toISOString()).toBe('2026-08-10T15:00:00.000Z');

    // A execução do passo SUSPEND não aponta pra mensagem nenhuma — suspender é
    // mudança de estado, não aviso.
    const suspendExecution = await db.dunningExecution.findFirstOrThrow({
      where: { chargeId: charge.id, step: { action: 'SUSPEND' } },
    });
    expect(suspendExecution.messageId).toBeNull();
  });

  // ⚠️ Esta cobrança pula direto pro dia 5 sem nenhuma passada nos dias 3 e 4 — cron
  // que falhou, envio pausado, canal caído. O degrau de recuperação (+3, "a partir
  // de") entra na mesma passada da suspensão, e é o desenho certo: cortar acesso de
  // quem nunca recebeu o último aviso é o pior resultado possível pro cliente final.
  it('quem chega no dia da suspensão sem nunca ter recebido o último aviso, recebe junto', async () => {
    await db.dunningRule.updateMany({ where: { isDefault: true }, data: { status: 'ACTIVE' } });
    const { customer, charge } = await seedFixture();
    await db.charge.update({ where: { id: charge.id }, data: { dueAt: new Date('2026-08-05T23:59:59-03:00') } });

    await evaluateDunningRule(new Date('2026-08-10T12:00:00-03:00'), false);

    const messages = await db.message.findMany({ where: { customerId: customer.id } });
    expect(messages).toHaveLength(1);
    const messageExecution = await db.dunningExecution.findFirstOrThrow({
      where: { chargeId: charge.id, step: { action: 'SEND_MESSAGE' } },
      include: { step: { select: { offsetDays: true } } },
    });
    expect(messageExecution.step.offsetDays).toBe(3);
    expect(messageExecution.messageId).toBe(messages[0].id);
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

describe('carimbo da passada (lastRunAt)', () => {
  it('régua ACTIVE grava lastRunAt e lastRunMessagesSent = Message criadas, não passos', async () => {
    await db.dunningRule.updateMany({ where: { isDefault: true }, data: { status: 'ACTIVE' } });
    const { customer } = await seedFixture();
    const supplier = await db.supplier.findFirstOrThrow({ where: { name: 'Fornecedor Teste' } });
    const plan = await db.plan.findFirstOrThrow({ where: { name: 'Plano Teste' } });
    // segunda cobrança do mesmo customer, no mesmo passo: consolida em 1 Message só.
    const subscription2 = await db.subscription.create({
      data: { customerId: customer.id, planId: plan.id, supplierId: supplier.id, priceCents: 4000n, costCents: 500n, cycle: 'MONTHLY', status: 'ACTIVE', startedAt: NOW, nextDueAt: NOW },
    });
    await db.charge.create({
      data: { subscriptionId: subscription2.id, customerId: customer.id, supplierId: supplier.id, principalCents: 4000n, periodStart: NOW, periodEnd: NOW, dueAt: new Date('2026-08-10T23:59:59-03:00'), status: 'OPEN' },
    });

    await evaluateDunningRule(NOW, false);

    const messages = await db.message.findMany({ where: { customerId: customer.id } });
    expect(messages).toHaveLength(1);
    const rule = await db.dunningRule.findFirstOrThrow({ where: { isDefault: true } });
    expect(rule.lastRunAt).toEqual(NOW);
    // 1 Message só (consolidada), não 2 — "N mensagens" conta Message, não passo.
    expect(rule.lastRunMessagesSent).toBe(1);
    expect(rule.lastRunPendingReview).toBe(0);
  });

  it('régua REVIEW grava lastRunPendingReview, e lastRunMessagesSent fica em 0 — revisão nunca cria Message', async () => {
    await db.dunningRule.updateMany({ where: { isDefault: true }, data: { status: 'REVIEW' } });
    await seedFixture();

    await evaluateDunningRule(NOW, false);

    const rule = await db.dunningRule.findFirstOrThrow({ where: { isDefault: true } });
    expect(rule.lastRunAt).toEqual(NOW);
    expect(rule.lastRunPendingReview).toBe(1);
    expect(rule.lastRunMessagesSent).toBe(0);
  });

  it('sem nenhum par (cobrança, passo) hoje: passada roda e zera o carimbo mesmo assim — motor rodou, só não achou nada', async () => {
    await db.dunningRule.updateMany({ where: { isDefault: true }, data: { status: 'ACTIVE' } });
    // Nenhuma fixture: nenhuma charge em aberto bate com o offsetDays de hoje.

    await evaluateDunningRule(NOW, false);

    const rule = await db.dunningRule.findFirstOrThrow({ where: { isDefault: true } });
    expect(rule.lastRunAt).toEqual(NOW);
    expect(rule.lastRunMessagesSent).toBe(0);
    expect(rule.lastRunPendingReview).toBe(0);
  });

  it('rodar duas vezes no mesmo now não quebra o carimbo — idempotente igual ao resto da passada', async () => {
    await db.dunningRule.updateMany({ where: { isDefault: true }, data: { status: 'ACTIVE' } });
    await seedFixture();

    await evaluateDunningRule(NOW, false);
    await evaluateDunningRule(NOW, false);

    const rule = await db.dunningRule.findFirstOrThrow({ where: { isDefault: true } });
    expect(rule.lastRunAt).toEqual(NOW);
    // segunda passada não encontra passo novo (já executado) — mensagem zero na segunda leitura.
    expect(rule.lastRunMessagesSent).toBe(0);
  });
});

/**
 * O degrau de recuperação — o último `SEND_MESSAGE` da escada casando por "a partir
 * de" em vez de dia exato (`selectStepsForCharge`). A régua padrão do seed tem
 * mensagens em -5, -2, 0, +1, +3 e SUSPEND em +5, então o degrau de recuperação é o
 * +3.
 *
 * ⚠️ O que estes testes protegem não é o disparo, é o **não** disparo repetido: um
 * degrau "a partir de" casa todo dia dali em diante, e sem o `UNIQUE(chargeId,
 * stepId)` segurando, a mesma cobrança receberia a mesma mensagem todo santo dia até
 * ser paga. Testar isso contra Postgres de verdade é o ponto — índice único não
 * existe em mock.
 */
describe('degrau de recuperação (último SEND_MESSAGE casa por "a partir de")', () => {
  // 20/08: 10 dias depois do vencimento de 10/08, muito além do degrau +3.
  const LATE_NOW = new Date('2026-08-20T12:00:00-03:00');

  it('cobrança que passou por baixo da escada ainda recebe o último aviso', async () => {
    await db.dunningRule.updateMany({ where: { isDefault: true }, data: { status: 'ACTIVE' } });
    const { customer, charge } = await seedFixture();

    const result = await evaluateDunningRule(LATE_NOW, false);

    expect(result.queued).toBe(1);
    const executions = await db.dunningExecution.findMany({
      where: { chargeId: charge.id },
      include: { step: { select: { offsetDays: true } } },
    });
    expect(executions).toHaveLength(1);
    expect(executions[0].step.offsetDays).toBe(3);
    const messages = await db.message.findMany({ where: { customerId: customer.id } });
    expect(messages).toHaveLength(1);
  });

  it('não repete no dia seguinte, nem no outro — uma cobrança, um último aviso', async () => {
    await db.dunningRule.updateMany({ where: { isDefault: true }, data: { status: 'ACTIVE' } });
    const { customer, charge } = await seedFixture();

    await evaluateDunningRule(LATE_NOW, false);
    const second = await evaluateDunningRule(new Date('2026-08-21T12:00:00-03:00'), false);
    const third = await evaluateDunningRule(new Date('2026-08-22T12:00:00-03:00'), false);

    expect(second.queued).toBe(0);
    expect(third.queued).toBe(0);
    const executions = await db.dunningExecution.findMany({ where: { chargeId: charge.id } });
    expect(executions).toHaveLength(1);
    const messages = await db.message.findMany({ where: { customerId: customer.id } });
    expect(messages).toHaveLength(1);
  });

  it('duas passadas no mesmo dia não duplicam — idempotência do cron', async () => {
    await db.dunningRule.updateMany({ where: { isDefault: true }, data: { status: 'ACTIVE' } });
    const { customer } = await seedFixture();

    await evaluateDunningRule(LATE_NOW, false);
    const again = await evaluateDunningRule(LATE_NOW, false);

    expect(again.queued).toBe(0);
    const messages = await db.message.findMany({ where: { customerId: customer.id } });
    expect(messages).toHaveLength(1);
  });

  // ⚠️ A trava que mais importa: "a partir de" não pode vazar pro SUSPEND. Se vazasse,
  // esta cobrança (10 dias vencida, muito além do degrau +5) seria suspensa aqui.
  it('SUSPEND não pega quem passou do dia dele — assinatura segue ACTIVE', async () => {
    await db.dunningRule.updateMany({ where: { isDefault: true }, data: { status: 'ACTIVE' } });
    const { subscription } = await seedFixture();

    const result = await evaluateDunningRule(LATE_NOW, false);

    expect(result.suspended).toBe(0);
    const reloaded = await db.subscription.findUnique({ where: { id: subscription.id } });
    expect(reloaded?.status).toBe('ACTIVE');
  });

  it('antes do degrau de recuperação, nada muda: dia 2 não casa nenhum degrau', async () => {
    await db.dunningRule.updateMany({ where: { isDefault: true }, data: { status: 'ACTIVE' } });
    const { charge } = await seedFixture();

    const result = await evaluateDunningRule(new Date('2026-08-12T12:00:00-03:00'), false);

    expect(result.queued).toBe(0);
    const executions = await db.dunningExecution.findMany({ where: { chargeId: charge.id } });
    expect(executions).toHaveLength(0);
  });
});
