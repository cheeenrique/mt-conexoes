import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { SubscriptionNotFoundError, SubscriptionCancelledError, PlanNotFoundError } from './errors';
import { encrypt } from '@/lib/crypto';
import { firstDueDate, endOfLocalDay, localDateOnly } from '@/core/dates';
import { computeChargeDiscount, isCourtesySubscription } from '@/core/billing';
import { alignOpenChargeDueAt, findOpenChargeWithOldPlanAmount } from './open-charge';
import { getSettings } from '@/lib/settings';
import type { z } from 'zod';
import type { subscriptionSchema } from './schema';
import { recordFinancialEvent } from '@/lib/financial-events';
import { diffSubscriptionForEvents, type SubscriptionSnapshot } from '@/core/subscription-events';

export type SubscriptionInput = z.infer<typeof subscriptionSchema>;

/**
 * Situação nova da assinatura. `suspendedAt` acompanha a transição em vez de
 * ficar preso ao primeiro valor: reativar e suspender de novo tem que datar a
 * suspensão de agora, senão o relatório de suspensas mente sobre desde quando.
 */
function statusPatch(
  existing: { status: string; suspendedAt: Date | null },
  next: SubscriptionInput['status'],
  now: Date,
) {
  if (!next || next === existing.status) return {};
  if (existing.status === 'CANCELLED') throw new SubscriptionCancelledError();
  return next === 'SUSPENDED'
    ? { status: 'SUSPENDED' as const, suspendedAt: now }
    : { status: 'ACTIVE' as const, suspendedAt: null };
}

// Vencimento e validade de desconto são conceitos **locais** — 'YYYY-MM-DD'
// vira 23:59:59 no fuso do negócio, não meia-noite UTC (que cai no dia
// anterior em America/Sao_Paulo).
function localDateStringToDueAt(dateStr: string, timezone: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  if (!year || !month || !day || Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
    // Nunca deveria chegar aqui se o schema validar certo — defesa em
    // profundidade pra não deixar `Invalid Date` vazar pro Prisma, cujo
    // erro de validação pode ecoar os outros argumentos da chamada
    // (incluindo accessPasswordEnc) direto pro log.
    throw new Error('Data de validade em formato inválido.');
  }
  return endOfLocalDay(year, month - 1, day, timezone);
}

/**
 * Campo ausente (`undefined`) significa **não mexer**; string vazia significa
 * **limpar**. A distinção existe porque a ficha do cliente (handoff 04) edita
 * só Plano, Fornecedor, valor, custo, vencimento, telas e acesso — ela não tem
 * campo de desconto. Tratar ausente como vazio ali apagaria em silêncio o
 * desconto que o operador combinou com o cliente, num formulário que nem
 * mostra desconto na tela.
 */
type SubscriptionWriteData = {
  priceCents: bigint;
  costCents: bigint;
  cycle: SubscriptionInput['cycle'];
  screens: number;
} & Partial<{
  planId: string | null;
  supplierId: string | null;
  discountType: 'PERCENT' | 'FIXED' | null;
  discountValue: string | null;
  discountUntil: Date | null;
  accessUsername: string | null;
  accessPasswordEnc: string;
  accessServer: string | null;
  accessNotes: string | null;
}>;

function toBaseData(input: SubscriptionInput, timezone: string): SubscriptionWriteData {
  const data: SubscriptionWriteData = {
    priceCents: BigInt(input.priceCents),
    costCents: BigInt(input.costCents),
    cycle: input.cycle,
    screens: input.screens,
  };

  if (input.planId !== undefined) data.planId = input.planId || null;
  if (input.supplierId !== undefined) data.supplierId = input.supplierId || null;
  if (input.discountType !== undefined) data.discountType = input.discountType || null;
  if (input.discountValue !== undefined) data.discountValue = input.discountValue || null;
  if (input.discountUntil !== undefined) {
    data.discountUntil = input.discountUntil ? localDateStringToDueAt(input.discountUntil, timezone) : null;
  }
  if (input.accessUsername !== undefined) data.accessUsername = input.accessUsername || null;
  // Senha vazia = mantém a atual. Ela nunca volta do servidor, então o campo
  // sempre nasce vazio na edição — apagar aqui perderia a credencial.
  if (input.accessPassword) data.accessPasswordEnc = encrypt(input.accessPassword, 'subscription.accessPassword');
  if (input.accessServer !== undefined) data.accessServer = input.accessServer || null;
  if (input.accessNotes !== undefined) data.accessNotes = input.accessNotes || null;

  return data;
}

/**
 * Nascimento de uma assinatura: a linha em `subscriptions` **e** a primeira
 * cobrança do ciclo, que `CLAUDE.md` §"Data e fuso" define como um dos dois
 * únicos momentos em que uma `Charge` nasce (`startedAt + ciclo`).
 *
 * Recebe o cliente de transação em vez de abrir o seu: a conversão de lead
 * precisa que cliente, assinatura, cobrança e a marcação do lead caiam no
 * mesmo commit. Reimplementar este trecho lá seria duplicar cálculo
 * financeiro entre dois caminhos — o erro que `.claude/rules/05-reuso.md`
 * chama de mais caro possível aqui.
 */
export async function insertSubscriptionWithFirstCharge(
  tx: Prisma.TransactionClient,
  params: { customerId: string; input: SubscriptionInput; timezone: string; startedAt: Date },
) {
  const { customerId, input, timezone, startedAt } = params;
  const nextDueAt =
    input.nextDueAt
      ? localDateStringToDueAt(input.nextDueAt, timezone)
      : firstDueDate({ startedAt, cycle: input.cycle, timezone });

  const subscription = await tx.subscription.create({
    data: { customerId, startedAt, nextDueAt, ...toBaseData(input, timezone) },
    omit: { accessPasswordEnc: true },
  });

  // Cortesia (preço zero) não abre cobrança: sem `Charge` ela fica fora de /charges,
  // fora dos chips de vencimento e fora da régua — que é o ponto. Antes disto a
  // cobrança de R$ 0 nascia `PAID` (`deriveChargeStatus`: 0 >= 0), nunca passava por
  // registrar pagamento e por isso nunca chamava `openNextCycle`: a cortesia emitia
  // uma cobrança e parava para sempre, aparecendo no diagnóstico como assinatura
  // ativa sem cobrança em aberto.
  if (subscription.status === 'ACTIVE' && !isCourtesySubscription(subscription)) {
    const periodStart = localDateOnly(startedAt, timezone);
    await tx.charge.create({
      data: {
        subscriptionId: subscription.id,
        customerId,
        supplierId: subscription.supplierId,
        principalCents: subscription.priceCents,
        discountCents: computeChargeDiscount(subscription, periodStart),
        costCents: subscription.costCents,
        periodStart,
        periodEnd: localDateOnly(nextDueAt, timezone),
        dueAt: nextDueAt,
      },
    });
  }

  return subscription;
}

export async function createSubscription(customerId: string, input: SubscriptionInput) {
  const settings = await getSettings();
  const startedAt = new Date();
  return db.$transaction((tx) =>
    insertSubscriptionWithFirstCharge(tx, { customerId, input, timezone: settings.timezone, startedAt }),
  );
}

/** Retrato achatado da assinatura para o histórico. Data vira 'YYYY-MM-DD' no
 *  fuso do negócio: vencimento é conceito local, e comparar ISO em UTC acusaria
 *  mudança onde só houve conversão. */
function snapshotSubscription(
  sub: { planId: string | null; priceCents: bigint; costCents: bigint; cycle: string; nextDueAt: Date; status: string },
  timezone: string,
): SubscriptionSnapshot {
  const local = localDateOnly(sub.nextDueAt, timezone);
  return {
    planId: sub.planId,
    priceCents: sub.priceCents.toString(),
    costCents: sub.costCents.toString(),
    cycle: sub.cycle,
    nextDueAt: local.toISOString().slice(0, 10),
    status: sub.status,
  };
}

/**
 * Edição da assinatura dentro de uma transação em curso. `customerId` é
 * conferido em vez de assumido: o id da assinatura chega do formulário, e a
 * ficha do cliente A não pode gravar na assinatura do cliente B.
 *
 * Cobrança já emitida nunca é tocada aqui — preço, custo e vencimento novos
 * valem da próxima cobrança gerada em diante (handoff 04 §"Modo edição").
 */
export async function patchSubscription(
  tx: Prisma.TransactionClient,
  params: { id: string; customerId?: string; input: SubscriptionInput; timezone: string; now: Date },
) {
  const { id, customerId, input, timezone, now } = params;
  const existing = await tx.subscription.findUnique({ where: { id }, omit: { accessPasswordEnc: true } });
  if (!existing || (customerId && existing.customerId !== customerId)) throw new SubscriptionNotFoundError();

  // Campo ausente = o operador não mexeu no vencimento; sobrescrever com o
  // valor atual seria reescrever a âncora do ciclo sem que ninguém pedisse.
  const nextDueAt = input.nextDueAt ? localDateStringToDueAt(input.nextDueAt, timezone) : null;

  const updated = await tx.subscription.update({
    where: { id },
    data: {
      ...toBaseData(input, timezone),
      ...statusPatch(existing, input.status, now),
      ...(nextDueAt ? { nextDueAt } : {}),
    },
    omit: { accessPasswordEnc: true },
  });

  const events = diffSubscriptionForEvents(
    snapshotSubscription(existing, timezone),
    snapshotSubscription(updated, timezone),
  );
  // ⚠️ `await` dentro de `for` é N+1 e normalmente não passa em review
  // (`.claude/rules/03-dados.md`). Aqui o N é no máximo 4, vem de campos de um
  // formulário — não de linhas do banco — e a ordem das linhas importa para a
  // leitura da ficha.
  for (const event of events) {
    await recordFinancialEvent(tx, {
      customerId: existing.customerId,
      entityType: 'SUBSCRIPTION',
      entityId: id,
      kind: event.kind,
      before: event.before,
      after: event.after,
    });
  }

  if (nextDueAt) await alignOpenChargeDueAt(tx, { subscriptionId: id, dueAt: nextDueAt, timezone, now });

  return updated;
}

export async function updateSubscription(id: string, input: SubscriptionInput) {
  const settings = await getSettings();
  return db.$transaction((tx) => patchSubscription(tx, { id, input, timezone: settings.timezone, now: new Date() }));
}

/**
 * Troca rápida de plano — ação da coluna "Plano" na tabela de Clientes. Ao
 * contrário de `updateSubscription`, não passa por `toBaseData`: aquela
 * função reescreve `screens` em toda chamada porque o form completo sempre
 * reenvia o valor atual junto. Aqui não há form — só o id do plano — então
 * `screens` e desconto ficam de fora do `data` para não sobrescrever com
 * nada. Fornecedor segue a mesma regra do form (handoff 08 §"Fornecedor: o
 * padrão"): plano com fornecedor troca, plano sem fornecedor não zera o
 * que a assinatura já tinha.
 */
export async function changeSubscriptionPlan(id: string, customerId: string, planId: string) {
  const [existing, plan] = await Promise.all([
    db.subscription.findUnique({
      where: { id },
      select: { customerId: true, status: true, planId: true, priceCents: true, costCents: true, cycle: true },
    }),
    db.plan.findUnique({ where: { id: planId } }),
  ]);
  if (!existing || existing.customerId !== customerId) throw new SubscriptionNotFoundError();
  if (!plan) throw new PlanNotFoundError();
  if (existing.status === 'CANCELLED') throw new SubscriptionCancelledError();

  return db.$transaction(async (tx) => {
    const subscription = await tx.subscription.update({
      where: { id },
      data: {
        planId: plan.id,
        priceCents: plan.priceCents,
        costCents: plan.costCents,
        cycle: plan.cycle,
        ...(plan.supplierId ? { supplierId: plan.supplierId } : {}),
      },
      omit: { accessPasswordEnc: true },
    });

    await recordFinancialEvent(tx, {
      customerId,
      entityType: 'SUBSCRIPTION',
      entityId: id,
      kind: 'SUBSCRIPTION_PLAN_CHANGED',
      before: {
        planId: existing.planId,
        priceCents: existing.priceCents.toString(),
        costCents: existing.costCents.toString(),
        cycle: existing.cycle,
      },
      after: {
        planId: plan.id,
        priceCents: plan.priceCents.toString(),
        costCents: plan.costCents.toString(),
        cycle: plan.cycle,
      },
    });

    // A cobrança em aberto não acompanha — e este caminho é o mais silencioso
    // dos dois, porque a coluna "Plano" não mostra valor nenhum na tela.
    // Devolvido para a tela perguntar; aplicar sozinho cobraria retroativo um
    // preço que o operador pode ter combinado só para o próximo ciclo.
    const staleOpenCharge = await findOpenChargeWithOldPlanAmount(tx, {
      subscriptionId: id,
      priceCents: plan.priceCents,
    });

    return { subscription, staleOpenCharge };
  });
}
