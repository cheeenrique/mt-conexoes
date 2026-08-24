/**
 * Seed de dado de demonstração — fornecedor, planos e um exemplar de cada
 * estado que as telas sabem mostrar (situação de cliente, status de cobrança,
 * status de lead, assinatura, margem e mensagem/execução da régua), pro dono
 * do produto conferir a interface com dado de verdade em vez de uma base
 * monótona onde tudo dá a mesma cor.
 *
 * Separado de seed.ts (que cuida de usuário, settings e régua padrão)
 * porque este arquivo é opcional e roda só quando alguém quer olhar a
 * interface no navegador. Nunca faz parte de `prisma db seed` automático.
 *
 * ⚠️ NUNCA rodar contra o banco de teste (TEST_DATABASE_URL). Este script só
 * lê DATABASE_URL (o de dev) — não lê TEST_DATABASE_URL. A guarda abaixo
 * recusa rodar se, por engano, as duas variáveis apontarem pro mesmo banco.
 *
 * Idempotência: todo registro de demonstração nasce com um `id` fixo
 * (`demo-...`), no mesmo espírito de `settings` (id "singleton") e
 * `dunningRule` (id "default-rule") em seed.ts. Cliente não tem `name` nem
 * `phone` estáveis o bastante pra virar chave de negócio aqui — o telefone,
 * por exemplo, muda de propósito entre os cenários (um deles testa cliente
 * SEM telefone). `id` fixo + upsert por `id` é a chave mais simples que
 * garante "rodar duas vezes dá o mesmo resultado" sem exigir busca prévia.
 *
 * Datas são sempre relativas a `now` (nunca fixas): "vence hoje" continua
 * vencendo hoje em qualquer dia que este script rodar.
 *
 * Uso: pnpm db:seed:demo
 */
import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import { addDays } from 'date-fns';
import { TZDate } from '@date-fns/tz';
import { endOfLocalDay, localDateOnly, nextDueDate, type BillingCycle } from '../src/core/dates';
import { deriveChargeStatus } from '../src/core/billing';

config({ path: '.env.local' });

if (process.env.TEST_DATABASE_URL && process.env.DATABASE_URL === process.env.TEST_DATABASE_URL) {
  console.error('[seed-demo] DATABASE_URL aponta pro banco de teste — recusando rodar.');
  process.exit(1);
}

/**
 * Id fixo de um registro de demonstração, em formato UUID.
 *
 * ⚠️ Precisa ser UUID de verdade, não `demo-customer-01`: as Server Actions validam
 * id com `z.uuid()`, e um id fora do formato faz a tela recusar a ação com uma
 * mensagem de validação — foi assim que o envio manual ficou intestável na base de
 * demonstração. O slug continua sendo a chave de leitura aqui no arquivo; o hash
 * só o transforma num UUID estável, para `upsert` por `id` seguir idempotente.
 */
function demoId(slug: string): string {
  const hex = createHash('sha1').update(`mt-conexoes-demo:${slug}`).digest('hex');
  const variant = ((parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0');
  return [hex.slice(0, 8), hex.slice(8, 12), `7${hex.slice(13, 16)}`, `${variant}${hex.slice(18, 20)}`, hex.slice(20, 32)].join('-');
}

const SUPPLIER_NAME = 'Painel P2P';
const SUPPLIER_UNIT_COST_CENTS = 1000n; // R$ 10,00 por mês de crédito

// Custo = unitCost × meses do ciclo. O "por mês" que a tela de vendas mostra
// (ex.: R$ 26,67 no semestral) é derivação de exibição — não se grava.
const DEMO_PLANS = [
  { name: 'Mensal', cycle: 'MONTHLY', priceCents: 3500n, costCents: 1000n },
  { name: 'Trimestral', cycle: 'QUARTERLY', priceCents: 9000n, costCents: 3000n },
  { name: 'Semestral', cycle: 'SEMIANNUAL', priceCents: 16000n, costCents: 6000n },
  { name: 'Anual', cycle: 'ANNUAL', priceCents: 30000n, costCents: 12000n },
] as const;

/** `now + offsetDays`, como vencimento (23:59:59 local). offsetDays negativo = passado. */
function dueAtOffset(now: Date, offsetDays: number, timezone: string): Date {
  const shifted = addDays(new TZDate(now, timezone), offsetDays);
  return endOfLocalDay(shifted.getFullYear(), shifted.getMonth(), shifted.getDate(), timezone);
}

/** `now + offsetDays`, como data sem hora (pra periodStart/periodEnd/scheduledDate). */
function dateOnlyOffset(now: Date, offsetDays: number, timezone: string): Date {
  const shifted = addDays(new TZDate(now, timezone), offsetDays);
  return localDateOnly(new Date(shifted.getTime()), timezone);
}

async function seedSupplierAndPlans(db: PrismaClient) {
  const supplier = await db.supplier.upsert({
    where: { name: SUPPLIER_NAME },
    update: { unitCostCents: SUPPLIER_UNIT_COST_CENTS },
    create: { name: SUPPLIER_NAME, unitCostCents: SUPPLIER_UNIT_COST_CENTS },
  });
  console.log(`[seed-demo] fornecedor pronto: ${supplier.name} (id ${supplier.id})`);

  const plans: Record<string, { id: string; priceCents: bigint; costCents: bigint }> = {};
  for (const plan of DEMO_PLANS) {
    const record = await db.plan.upsert({
      where: { name: plan.name },
      update: {
        priceCents: plan.priceCents,
        costCents: plan.costCents,
        cycle: plan.cycle,
        supplierId: supplier.id,
      },
      create: {
        name: plan.name,
        priceCents: plan.priceCents,
        costCents: plan.costCents,
        cycle: plan.cycle,
        supplierId: supplier.id,
      },
    });
    plans[plan.name] = { id: record.id, priceCents: record.priceCents, costCents: record.costCents };
    console.log(`[seed-demo] plano pronto: ${record.name} (${record.cycle})`);
  }
  return { supplier, plans };
}

interface DemoCustomerSpec {
  id: string;
  name: string;
  phone: string | null;
}

const DEMO_CUSTOMERS: DemoCustomerSpec[] = [
  { id: demoId('demo-customer-01'), name: 'Demo · Cliente em Dia', phone: '+5562999900001' },
  { id: demoId('demo-customer-02'), name: 'Demo · Vence Hoje', phone: '+5562999900002' },
  { id: demoId('demo-customer-03'), name: 'Demo · Em Atraso (margem crítica)', phone: '+5562999900003' },
  { id: demoId('demo-customer-04'), name: 'Demo · Cobrança em Aberto', phone: '+5562999900004' },
  { id: demoId('demo-customer-05'), name: 'Demo · Assinatura Suspensa', phone: '+5562999900005' },
  { id: demoId('demo-customer-06'), name: 'Demo · Pagamento Parcial', phone: '+5562999900006' },
  { id: demoId('demo-customer-07'), name: 'Demo · Sem Assinatura', phone: '+5562999900007' },
  { id: demoId('demo-customer-08'), name: 'Demo · Sem Telefone (execução pulada)', phone: null },
];

async function seedCustomers(db: PrismaClient) {
  const customers: Record<string, { id: string; phone: string | null }> = {};
  for (const spec of DEMO_CUSTOMERS) {
    const row = await db.customer.upsert({
      where: { id: spec.id },
      update: { name: spec.name, phone: spec.phone },
      create: { id: spec.id, name: spec.name, phone: spec.phone },
    });
    customers[spec.id] = { id: row.id, phone: row.phone };
  }
  console.log(`[seed-demo] ${DEMO_CUSTOMERS.length} clientes de demonstração prontos`);
  return customers;
}

/** Cria (ou atualiza) uma assinatura + a cobrança viva dela, com status derivado por `deriveChargeStatus`
 *  — nunca hardcoded — pra nunca divergir da regra real que a tela usa. */
async function seedSubscriptionWithLiveCharge(
  db: PrismaClient,
  params: {
    id: string;
    customerId: string;
    planId: string | null;
    supplierId: string;
    priceCents: bigint;
    costCents: bigint;
    cycle: BillingCycle;
    subscriptionStatus: 'ACTIVE' | 'SUSPENDED';
    startedAtOffsetDays: number;
    suspendedAtOffsetDays?: number;
    charge: {
      id: string;
      dueAtOffsetDays: number;
      periodStartOffsetDays: number;
      issuedAtOffsetDays: number;
      costCents: bigint;
      paidCents?: bigint;
    };
    now: Date;
    timezone: string;
  },
) {
  const startedAt = dueAtOffset(params.now, params.startedAtOffsetDays, params.timezone);
  const chargeDueAt = dueAtOffset(params.now, params.charge.dueAtOffsetDays, params.timezone);
  const periodStart = dateOnlyOffset(params.now, params.charge.periodStartOffsetDays, params.timezone);
  const periodEnd = dateOnlyOffset(params.now, params.charge.dueAtOffsetDays, params.timezone);
  const issuedAt = dueAtOffset(params.now, params.charge.issuedAtOffsetDays, params.timezone);
  const netCents = params.priceCents;
  const paidCents = params.charge.paidCents ?? 0n;
  const status = deriveChargeStatus({ netCents, paidCents, dueAt: chargeDueAt, now: params.now });

  const subscriptionData = {
    customerId: params.customerId,
    planId: params.planId,
    supplierId: params.supplierId,
    priceCents: params.priceCents,
    costCents: params.costCents,
    cycle: params.cycle,
    startedAt,
    nextDueAt: chargeDueAt,
    status: params.subscriptionStatus,
    suspendedAt:
      params.subscriptionStatus === 'SUSPENDED' && params.suspendedAtOffsetDays !== undefined
        ? dueAtOffset(params.now, params.suspendedAtOffsetDays, params.timezone)
        : null,
  };

  const subscription = await db.subscription.upsert({
    where: { id: params.id },
    update: subscriptionData,
    create: { id: params.id, ...subscriptionData },
  });

  const chargeData = {
    subscriptionId: subscription.id,
    customerId: params.customerId,
    supplierId: params.supplierId,
    principalCents: params.priceCents,
    discountCents: 0n,
    costCents: params.charge.costCents,
    periodStart,
    periodEnd,
    dueAt: chargeDueAt,
    issuedAt,
    status,
    paidAt: null,
  };

  const charge = await db.charge.upsert({
    where: { id: params.charge.id },
    update: chargeData,
    create: { id: params.charge.id, ...chargeData },
  });

  return { subscription, charge };
}

async function seedCustomer01AtivoEmDia(
  db: PrismaClient,
  customerId: string,
  plan: { id: string },
  supplierId: string,
  now: Date,
  timezone: string,
) {
  // A assinatura precisa existir antes das cobranças (FK) — `nextDueAt` definitivo
  // só é conhecido depois do pagamento mais recente, então este upsert inicial usa um
  // valor provisório e o upsert final, no fim da função, corrige para o valor certo.
  await db.subscription.upsert({
    where: { id: demoId('demo-subscription-01') },
    update: {},
    create: {
      id: demoId('demo-subscription-01'),
      customerId,
      planId: plan.id,
      supplierId,
      priceCents: 3500n,
      costCents: 1000n,
      cycle: 'MONTHLY',
      startedAt: dueAtOffset(now, -95, timezone),
      nextDueAt: dueAtOffset(now, -5, timezone),
      status: 'ACTIVE',
    },
  });

  // Todas as cobranças estão fechadas (CANCELLED + PAID) — sem cobrança viva,
  // então `resolveCustomerSituation` devolve ACTIVE.
  const oldPeriodStart = dateOnlyOffset(now, -65, timezone);
  const oldPeriodEnd = dateOnlyOffset(now, -35, timezone);
  const oldDueAt = dueAtOffset(now, -35, timezone);

  const cancelledChargeData = {
    subscriptionId: demoId('demo-subscription-01'),
    customerId,
    supplierId,
    principalCents: 3500n,
    discountCents: 0n,
    // Congelado na emissão: o fornecedor cobrava R$ 7,00 na época, bem abaixo do custo atual (R$ 10,00).
    costCents: 700n,
    periodStart: oldPeriodStart,
    periodEnd: oldPeriodEnd,
    dueAt: oldDueAt,
    issuedAt: dueAtOffset(now, -65, timezone),
    status: 'CANCELLED' as const,
    cancelledAt: dueAtOffset(now, -34, timezone),
    cancelReason: 'Cobrança duplicada, corrigida manualmente.',
  };
  await db.charge.upsert({
    where: { id: demoId('demo-charge-01a') },
    update: cancelledChargeData,
    create: { id: demoId('demo-charge-01a'), ...cancelledChargeData },
  });

  const paidPeriodStart = dateOnlyOffset(now, -35, timezone);
  const paidDueAt = dueAtOffset(now, -5, timezone);
  const paidAt = dueAtOffset(now, -6, timezone);

  const paidChargeData = {
    subscriptionId: demoId('demo-subscription-01'),
    customerId,
    supplierId,
    principalCents: 3500n,
    discountCents: 0n,
    // Custo diferente do de cima e do custo atual do plano (R$ 10,00) — o fornecedor
    // subiu o preço entre um ciclo e outro, e o histórico não pode mudar retroativamente.
    costCents: 900n,
    periodStart: paidPeriodStart,
    periodEnd: dateOnlyOffset(now, -5, timezone),
    dueAt: paidDueAt,
    issuedAt: dueAtOffset(now, -35, timezone),
    status: 'PAID' as const,
    paidAt,
  };
  await db.charge.upsert({
    where: { id: demoId('demo-charge-01b') },
    update: paidChargeData,
    create: { id: demoId('demo-charge-01b'), ...paidChargeData },
  });

  await db.payment.upsert({
    where: { id: demoId('demo-payment-01b') },
    update: { chargeId: demoId('demo-charge-01b'), amountCents: 3500n, paidAt },
    create: {
      id: demoId('demo-payment-01b'),
      chargeId: demoId('demo-charge-01b'),
      amountCents: 3500n,
      method: 'PIX',
      source: 'MANUAL',
      idempotencyKey: demoId('demo-payment-01b'),
      paidAt,
      note: 'Pagamento de demonstração.',
    },
  });

  const subscriptionData = {
    customerId,
    planId: plan.id,
    supplierId,
    priceCents: 3500n,
    costCents: 1000n,
    cycle: 'MONTHLY' as const,
    startedAt: dueAtOffset(now, -95, timezone),
    // Próxima cobrança = data do pagamento do ciclo atual + duração do ciclo — nunca dia fixo.
    nextDueAt: nextDueDate({ paidAt, cycle: 'MONTHLY', timezone }),
    status: 'ACTIVE' as const,
    suspendedAt: null,
  };
  await db.subscription.upsert({
    where: { id: demoId('demo-subscription-01') },
    update: subscriptionData,
    create: { id: demoId('demo-subscription-01'), ...subscriptionData },
  });
}

/** Mensagem da régua (SENT/FAILED/CANCELLED) + o `DunningExecution` QUEUED que a acompanha —
 *  o mesmo par que `persistConsolidatedMessage` grava numa transação real (features/dunning/evaluate.ts).
 *  Extraído na 3ª ocorrência (regra de reuso do projeto): os cenários 02, 03 e 04 só diferem no conteúdo. */
async function seedDunningMessage(
  db: PrismaClient,
  spec: {
    id: string;
    executionId: string;
    customerId: string;
    chargeId: string;
    stepId: string;
    toPhone: string;
    body: string;
    status: 'SENT' | 'FAILED' | 'CANCELLED';
    scheduledFor: Date;
    scheduledDate: Date;
    createdAt?: Date;
    sentAt?: Date;
    failReason?: string;
    cancelReason?: string;
    externalId?: string;
  },
) {
  const message = await db.message.upsert({
    where: { id: spec.id },
    update: {},
    create: {
      id: spec.id,
      customerId: spec.customerId,
      chargeId: spec.chargeId,
      kind: 'DUNNING',
      status: spec.status,
      toPhone: spec.toPhone,
      body: spec.body,
      scheduledFor: spec.scheduledFor,
      scheduledDate: spec.scheduledDate,
      sentAt: spec.sentAt ?? null,
      attempts: spec.status === 'CANCELLED' ? 0 : 1,
      failReason: spec.failReason ?? null,
      cancelReason: spec.cancelReason ?? null,
      externalId: spec.externalId ?? null,
      ...(spec.createdAt ? { createdAt: spec.createdAt } : {}),
    },
  });
  await db.dunningExecution.upsert({
    where: { chargeId_stepId: { chargeId: spec.chargeId, stepId: spec.stepId } },
    update: { outcome: 'QUEUED', messageId: message.id },
    create: { id: spec.executionId, chargeId: spec.chargeId, stepId: spec.stepId, outcome: 'QUEUED', messageId: message.id },
  });
  return message;
}

async function getDefaultRuleSteps(db: PrismaClient) {
  const steps = await db.dunningStep.findMany({ where: { ruleId: 'default-rule' } });
  if (steps.length === 0) {
    throw new Error(
      '[seed-demo] régua padrão (default-rule) não encontrada — rode `pnpm db:seed` antes de `pnpm db:seed:demo`.',
    );
  }
  const byOffset = new Map(steps.map((s) => [s.offsetDays, s]));
  return byOffset;
}

async function seedLeads(db: PrismaClient, convertedCustomerId: string, now: Date, timezone: string) {
  const leads = [
    {
      id: demoId('demo-lead-new'),
      name: 'Demo · Lead Novo',
      phone: '+5562999901001',
      city: 'Goiânia',
      interestPlan: 'Mensal',
      source: 'site · planos',
      status: 'NEW' as const,
      customerId: null,
      note: null,
      createdAtOffsetDays: -1,
    },
    {
      id: demoId('demo-lead-contacted'),
      name: 'Demo · Lead Contatado',
      phone: '+5562999901002',
      city: 'Anápolis',
      interestPlan: 'Trimestral',
      source: 'site · home',
      status: 'CONTACTED' as const,
      customerId: null,
      note: 'Respondeu no WhatsApp, aguardando decisão.',
      createdAtOffsetDays: -4,
    },
    {
      id: demoId('demo-lead-converted'),
      name: 'Demo · Lead Convertido',
      phone: '+5562999901003',
      city: 'Goiânia',
      interestPlan: 'Mensal',
      source: 'site · planos',
      status: 'CONVERTED' as const,
      customerId: convertedCustomerId,
      note: null,
      createdAtOffsetDays: -20,
    },
    {
      id: demoId('demo-lead-discarded'),
      name: 'Demo · Lead Descartado',
      phone: '+5562999901004',
      city: null,
      interestPlan: null,
      source: 'site · contato',
      status: 'DISCARDED' as const,
      customerId: null,
      note: 'Não respondeu após 3 tentativas de contato.',
      createdAtOffsetDays: -10,
    },
  ];

  for (const lead of leads) {
    const data = {
      name: lead.name,
      phone: lead.phone,
      city: lead.city,
      interestPlan: lead.interestPlan,
      source: lead.source,
      status: lead.status,
      customerId: lead.customerId,
      note: lead.note,
      createdAt: dueAtOffset(now, lead.createdAtOffsetDays, timezone),
    };
    await db.lead.upsert({ where: { id: lead.id }, update: data, create: { id: lead.id, ...data } });
  }
  console.log(`[seed-demo] ${leads.length} leads de demonstração prontos`);
}

async function main() {
  const db = new PrismaClient();
  try {
    const { supplier, plans } = await seedSupplierAndPlans(db);
    const customers = await seedCustomers(db);
    const settings = await db.settings.findUnique({ where: { id: 'singleton' } });
    if (!settings) {
      throw new Error('[seed-demo] settings (singleton) não encontrado — rode `pnpm db:seed` antes de `pnpm db:seed:demo`.');
    }
    const timezone = settings.timezone;
    const now = new Date();
    const steps = await getDefaultRuleSteps(db);

    // 01 — ACTIVE, sem cobrança viva, custo congelado divergindo entre ciclos.
    await seedCustomer01AtivoEmDia(db, customers[demoId('demo-customer-01')].id, plans.Mensal, supplier.id, now, timezone);

    // 02 — DUE_TODAY, margem apertada (25%), mensagem ENVIADA.
    const sub02 = await seedSubscriptionWithLiveCharge(db, {
      id: demoId('demo-subscription-02'),
      customerId: customers[demoId('demo-customer-02')].id,
      planId: null, // preço fora da tabela padrão, de propósito, pra fechar a margem em 25%
      supplierId: supplier.id,
      priceCents: 4000n,
      costCents: 3000n,
      cycle: 'MONTHLY',
      subscriptionStatus: 'ACTIVE',
      startedAtOffsetDays: -60,
      charge: { id: demoId('demo-charge-02'), dueAtOffsetDays: 0, periodStartOffsetDays: -30, issuedAtOffsetDays: -30, costCents: 3000n },
      now,
      timezone,
    });
    const step02 = steps.get(0);
    if (step02) {
      await seedDunningMessage(db, {
        id: demoId('demo-message-sent'),
        executionId: demoId('demo-execution-sent'),
        customerId: customers[demoId('demo-customer-02')].id,
        chargeId: sub02.charge.id,
        stepId: step02.id,
        status: 'SENT',
        toPhone: customers[demoId('demo-customer-02')].phone!,
        body: 'Olá! Sua renovação de R$ 40,00 vence hoje. Pix: chave-demo@mtconexoes.com.br\n\nMT Conexões',
        scheduledFor: now,
        scheduledDate: dateOnlyOffset(now, 0, timezone),
        sentAt: now,
        externalId: demoId('demo-external-sent'),
      });
    }

    // 03 — OVERDUE (D+3), margem crítica (≈10%), preço com dízima R$ 33,33, mensagem FALHOU.
    const sub03 = await seedSubscriptionWithLiveCharge(db, {
      id: demoId('demo-subscription-03'),
      customerId: customers[demoId('demo-customer-03')].id,
      planId: null,
      supplierId: supplier.id,
      priceCents: 3333n, // R$ 33,33 — dízima que já quebrou sistema, ver CLAUDE.md
      costCents: 3000n,
      cycle: 'MONTHLY',
      subscriptionStatus: 'ACTIVE',
      startedAtOffsetDays: -63,
      charge: { id: demoId('demo-charge-03'), dueAtOffsetDays: -3, periodStartOffsetDays: -33, issuedAtOffsetDays: -33, costCents: 3000n },
      now,
      timezone,
    });
    const step03 = steps.get(3);
    if (step03) {
      await seedDunningMessage(db, {
        id: demoId('demo-message-failed'),
        executionId: demoId('demo-execution-failed'),
        customerId: customers[demoId('demo-customer-03')].id,
        chargeId: sub03.charge.id,
        stepId: step03.id,
        status: 'FAILED',
        toPhone: customers[demoId('demo-customer-03')].phone!,
        body: 'Olá! Sua renovação de R$ 33,33 está 3 dia(s) atrasada. Pix: chave-demo@mtconexoes.com.br\n\nMT Conexões',
        scheduledFor: now,
        scheduledDate: dateOnlyOffset(now, 0, timezone),
        failReason: 'body_too_long',
      });
    }

    // 04 — OPEN (D-2, vence em 2 dias), mensagem CANCELADA por ficar >24h na fila (stale).
    const sub04 = await seedSubscriptionWithLiveCharge(db, {
      id: demoId('demo-subscription-04'),
      customerId: customers[demoId('demo-customer-04')].id,
      planId: plans.Semestral.id,
      supplierId: supplier.id,
      priceCents: plans.Semestral.priceCents,
      costCents: plans.Semestral.costCents,
      cycle: 'SEMIANNUAL',
      subscriptionStatus: 'ACTIVE',
      startedAtOffsetDays: -178,
      charge: { id: demoId('demo-charge-04'), dueAtOffsetDays: 2, periodStartOffsetDays: -178, issuedAtOffsetDays: -178, costCents: plans.Semestral.costCents },
      now,
      timezone,
    });
    const step04 = steps.get(-2);
    if (step04) {
      // Mensagem ficou >24h na fila (T8) — o kill switch a teria cancelado como `stale`.
      // dd/MM/aaaa, como o renderizador de template escreve — dado de demonstração
      // com formato diferente do de produção faz quem confere a tela achar bug onde
      // não tem, e esconder o que tem.
      const dueDateLabel = dateOnlyOffset(now, 2, timezone).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
      await seedDunningMessage(db, {
        id: demoId('demo-message-cancelled'),
        executionId: demoId('demo-execution-cancelled'),
        customerId: customers[demoId('demo-customer-04')].id,
        chargeId: sub04.charge.id,
        stepId: step04.id,
        status: 'CANCELLED',
        toPhone: customers[demoId('demo-customer-04')].phone!,
        body: `Olá! Sua renovação de R$ 160,00 vence dia ${dueDateLabel}. Pix: chave-demo@mtconexoes.com.br\n\nMT Conexões`,
        scheduledFor: dueAtOffset(now, -2, timezone),
        scheduledDate: dateOnlyOffset(now, -2, timezone),
        createdAt: dueAtOffset(now, -2, timezone),
        cancelReason: 'stale',
      });
    }

    // 05 — SUSPENDED com cobrança OVERDUE há 10 dias (D+5) — prova que SUSPENDED
    // manda na situação do cliente mesmo com cobrança vencida por baixo.
    await seedSubscriptionWithLiveCharge(db, {
      id: demoId('demo-subscription-05'),
      customerId: customers[demoId('demo-customer-05')].id,
      planId: plans.Anual.id,
      supplierId: supplier.id,
      priceCents: plans.Anual.priceCents,
      costCents: plans.Anual.costCents,
      cycle: 'ANNUAL',
      subscriptionStatus: 'SUSPENDED',
      startedAtOffsetDays: -380,
      suspendedAtOffsetDays: -8,
      charge: { id: demoId('demo-charge-05'), dueAtOffsetDays: -10, periodStartOffsetDays: -370, issuedAtOffsetDays: -370, costCents: plans.Anual.costCents },
      now,
      timezone,
    });

    // 06 — PARTIALLY_PAID (dueAt no futuro), pagamento de R$ 0,01 — o valor mínimo que já quebrou sistema.
    await seedSubscriptionWithLiveCharge(db, {
      id: demoId('demo-subscription-06'),
      customerId: customers[demoId('demo-customer-06')].id,
      planId: plans.Mensal.id,
      supplierId: supplier.id,
      priceCents: plans.Mensal.priceCents,
      costCents: plans.Mensal.costCents,
      cycle: 'MONTHLY',
      subscriptionStatus: 'ACTIVE',
      startedAtOffsetDays: -25,
      charge: {
        id: demoId('demo-charge-06'),
        dueAtOffsetDays: 5,
        periodStartOffsetDays: -25,
        issuedAtOffsetDays: -25,
        costCents: plans.Mensal.costCents,
        paidCents: 1n,
      },
      now,
      timezone,
    });
    await db.payment.upsert({
      where: { id: demoId('demo-payment-06') },
      update: {},
      create: {
        id: demoId('demo-payment-06'),
        chargeId: demoId('demo-charge-06'),
        amountCents: 1n,
        method: 'PIX',
        source: 'MANUAL',
        idempotencyKey: demoId('demo-payment-06'),
        paidAt: dueAtOffset(now, -1, timezone),
        note: 'Pagamento de demonstração de R$ 0,01 — valor mínimo que já quebrou sistema.',
      },
    });

    // 07 — NO_SUBSCRIPTION: cliente cadastrado, nenhuma assinatura criada de propósito
    // (o cadastro em `seedCustomers` já basta — `resolveCustomerSituation` devolve
    // NO_SUBSCRIPTION sem precisar de uma assinatura CANCELLED aqui).

    // 08 — sem telefone, cobrança OVERDUE há 1 dia (D+1): a régua avalia o passo D+1
    // e pula ANTES de montar mensagem — não existe, e nunca vai existir, Message para isto.
    const sub08 = await seedSubscriptionWithLiveCharge(db, {
      id: demoId('demo-subscription-08'),
      customerId: customers[demoId('demo-customer-08')].id,
      planId: plans.Mensal.id,
      supplierId: supplier.id,
      priceCents: plans.Mensal.priceCents,
      costCents: plans.Mensal.costCents,
      cycle: 'MONTHLY',
      subscriptionStatus: 'ACTIVE',
      startedAtOffsetDays: -35,
      charge: { id: demoId('demo-charge-08'), dueAtOffsetDays: -1, periodStartOffsetDays: -31, issuedAtOffsetDays: -31, costCents: plans.Mensal.costCents },
      now,
      timezone,
    });
    const step08 = steps.get(1);
    if (step08) {
      await db.dunningExecution.upsert({
        where: { chargeId_stepId: { chargeId: sub08.charge.id, stepId: step08.id } },
        update: { outcome: 'SKIPPED', reason: 'no_phone', messageId: null },
        create: { id: demoId('demo-execution-skipped'), chargeId: sub08.charge.id, stepId: step08.id, outcome: 'SKIPPED', reason: 'no_phone' },
      });
    }

    console.log('[seed-demo] 8 assinaturas/cobranças de demonstração prontas (situações, margens e mensagens)');

    await seedLeads(db, customers[demoId('demo-customer-01')].id, now, timezone);
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error('[seed-demo] falhou:', err);
  process.exit(1);
});
