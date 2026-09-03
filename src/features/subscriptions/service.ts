import Decimal from 'decimal.js';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { DomainError } from '@/lib/errors';
import { encrypt, decrypt } from '@/lib/crypto';
import { firstDueDate, endOfLocalDay, localDateOnly } from '@/core/dates';
import { applyPercent } from '@/core/money';
import { getSettings } from '@/lib/settings';
import type { z } from 'zod';
import type { subscriptionSchema } from './schema';

export type SubscriptionInput = z.infer<typeof subscriptionSchema>;

export class SubscriptionNotFoundError extends DomainError {
  constructor(cause?: unknown) {
    super('Assinatura não encontrada.', 'SUBSCRIPTION_NOT_FOUND', { cause });
  }
}

export class SubscriptionCancelledError extends DomainError {
  constructor(cause?: unknown) {
    super('Esta assinatura foi cancelada e não volta a ficar ativa por aqui.', 'SUBSCRIPTION_CANCELLED', { cause });
  }
}

export class PlanNotFoundError extends DomainError {
  constructor(cause?: unknown) {
    super('Plano não encontrado.', 'PLAN_NOT_FOUND', { cause });
  }
}

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

  if (subscription.status === 'ACTIVE') {
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

/** Desconto vigente na emissão, em centavos. discountUntil precisa cobrir o início do período. */
export function computeChargeDiscount(
  subscription: { priceCents: bigint; discountType: string | null; discountValue: unknown; discountUntil: Date | null },
  periodStart: Date,
): bigint {
  if (!subscription.discountType || !subscription.discountValue) return 0n;
  if (subscription.discountUntil && subscription.discountUntil < periodStart) return 0n;

  const value = new Decimal(subscription.discountValue.toString());
  if (subscription.discountType === 'PERCENT') {
    return applyPercent(subscription.priceCents, value);
  }
  // FIXED: discountValue está em reais (Decimal(10,2)), converte pra centavos.
  return BigInt(value.times(100).toFixed(0));
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

  return tx.subscription.update({
    where: { id },
    data: {
      ...toBaseData(input, timezone),
      ...statusPatch(existing, input.status, now),
      // Campo ausente = o operador não mexeu no vencimento; sobrescrever com
      // o valor atual seria reescrever a âncora do ciclo sem que ninguém
      // pedisse.
      ...(input.nextDueAt ? { nextDueAt: localDateStringToDueAt(input.nextDueAt, timezone) } : {}),
    },
    omit: { accessPasswordEnc: true },
  });
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
    db.subscription.findUnique({ where: { id }, select: { customerId: true, status: true } }),
    db.plan.findUnique({ where: { id: planId } }),
  ]);
  if (!existing || existing.customerId !== customerId) throw new SubscriptionNotFoundError();
  if (!plan) throw new PlanNotFoundError();
  if (existing.status === 'CANCELLED') throw new SubscriptionCancelledError();

  return db.subscription.update({
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
}

export async function revealCredential(subscriptionId: string, userId: string, ip: string | null) {
  const subscription = await db.subscription.findUnique({ where: { id: subscriptionId } });
  if (!subscription) throw new SubscriptionNotFoundError();
  if (!subscription.accessPasswordEnc) return '';

  await db.credentialReveal.create({ data: { subscriptionId, userId, ip } });
  return decrypt(subscription.accessPasswordEnc, 'subscription.accessPassword');
}

/**
 * Criação de assinatura pela importação da base — única exceção no app que
 * NÃO calcula `nextDueAt` via `firstDueDate`. A planilha de origem só tem o
 * vencimento atual (controlado na mão pelo cliente), nunca um histórico de
 * pagamento — decisão registrada em docs/superpowers/specs/2026-08-07-etapa-1c-importacao-design.md.
 * A partir do primeiro pagamento registrado no sistema novo, a regra normal
 * (pagamento → próximo vencimento) passa a valer.
 *
 * Recebe `tx`: a orquestração (`app/(app)/customers/customer-import.ts`)
 * processa a planilha em blocos de ~500 linhas, cada bloco num commit só —
 * a checagem de idempotência, a resolução do `Customer` e esta criação
 * precisam estar na mesma transação.
 */
export async function createImportedSubscription(
  tx: Prisma.TransactionClient,
  params: {
    customerId: string;
    supplierId: string;
    priceCents: bigint;
    costCents: bigint;
    nextDueAt: Date;
    startedAt: Date;
    accessUsername: string | null;
    accessPassword: string | null;
    screens: number;
  },
): Promise<{ id: string }> {
  return tx.subscription.create({
    data: {
      customerId: params.customerId,
      supplierId: params.supplierId,
      priceCents: params.priceCents,
      costCents: params.costCents,
      cycle: 'MONTHLY',
      nextDueAt: params.nextDueAt,
      startedAt: params.startedAt,
      accessUsername: params.accessUsername,
      accessPasswordEnc: params.accessPassword ? encrypt(params.accessPassword, 'subscription.accessPassword') : null,
      screens: params.screens,
    },
    select: { id: true },
  });
}

/**
 * Idempotência da importação — checado ANTES de tocar em `Customer`, porque
 * telefone nulo não serve de chave de upsert (`WHERE phone IS NULL` bateria
 * em qualquer cliente sem telefone, não no cliente certo desta linha).
 */
export async function findImportedSubscriptionBySupplier(
  tx: Prisma.TransactionClient,
  params: { supplierId: string; accessUsername: string },
): Promise<{ id: string } | null> {
  return tx.subscription.findFirst({
    where: { supplierId: params.supplierId, accessUsername: params.accessUsername },
    select: { id: true },
  });
}

/**
 * Direito de eliminação (LGPD) — zera a credencial de acesso do assinante em
 * **todas** as assinaturas do cliente (histórico incluído, não só a vigente).
 * `assertAnonymizable` já garantiu que nenhuma está `ACTIVE`, então isto nunca
 * apaga credencial de acesso que alguém ainda usa.
 */
export async function scrubSubscriptionAccess(tx: Prisma.TransactionClient, customerId: string): Promise<void> {
  await tx.subscription.updateMany({
    where: { customerId },
    data: { accessUsername: null, accessPasswordEnc: null, accessServer: null, accessNotes: null },
  });
}
