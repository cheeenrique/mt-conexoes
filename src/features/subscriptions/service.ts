import Decimal from 'decimal.js';
import { db } from '@/lib/db';
import { DomainError } from '@/lib/errors';
import { encrypt, decrypt } from '@/lib/crypto';
import { firstDueDate, endOfLocalDay, localDateOnly } from '@/core/dates';
import { applyPercent } from '@/core/money';
import { getSettings } from '@/features/settings/queries';
import type { z } from 'zod';
import type { subscriptionSchema } from './schema';

type SubscriptionInput = z.infer<typeof subscriptionSchema>;

export class SubscriptionNotFoundError extends DomainError {
  constructor(cause?: unknown) {
    super('Assinatura não encontrada.', 'SUBSCRIPTION_NOT_FOUND', { cause });
  }
}

// Validade de desconto é conceito local, igual vencimento — 'YYYY-MM-DD'
// vira 23:59:59 no fuso do negócio, não meia-noite UTC (que cai no dia
// anterior em America/Sao_Paulo).
function discountUntilLocal(dateStr: string, timezone: string): Date {
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

function toBaseData(input: SubscriptionInput, timezone: string) {
  return {
    planId: input.planId || null,
    supplierId: input.supplierId || null,
    priceCents: BigInt(input.priceCents),
    costCents: BigInt(input.costCents),
    cycle: input.cycle,
    discountType: input.discountType || null,
    discountValue: input.discountValue ? input.discountValue : null,
    discountUntil: input.discountUntil ? discountUntilLocal(input.discountUntil, timezone) : null,
    accessUsername: input.accessUsername || null,
    accessPasswordEnc: input.accessPassword
      ? encrypt(input.accessPassword, 'subscription.accessPassword')
      : undefined,
    accessServer: input.accessServer || null,
    screens: input.screens,
    accessNotes: input.accessNotes || null,
  };
}

export async function createSubscription(customerId: string, input: SubscriptionInput) {
  const settings = await getSettings();
  const startedAt = new Date();
  const nextDueAt = firstDueDate({ startedAt, cycle: input.cycle, timezone: settings.timezone });

  return db.$transaction(async (tx) => {
    const subscription = await tx.subscription.create({
      data: {
        customerId,
        startedAt,
        nextDueAt,
        ...toBaseData(input, settings.timezone),
      },
      omit: { accessPasswordEnc: true },
    });

    if (subscription.status === 'ACTIVE') {
      const principalCents = subscription.priceCents;
      const periodStart = localDateOnly(startedAt, settings.timezone);
      const discountCents = computeChargeDiscount(subscription, periodStart);

      await tx.charge.create({
        data: {
          subscriptionId: subscription.id,
          customerId,
          supplierId: subscription.supplierId,
          principalCents,
          discountCents,
          costCents: subscription.costCents,
          periodStart,
          periodEnd: localDateOnly(nextDueAt, settings.timezone),
          dueAt: nextDueAt,
        },
      });
    }

    return subscription;
  });
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

export async function updateSubscription(id: string, input: SubscriptionInput) {
  const existing = await db.subscription.findUnique({ where: { id }, omit: { accessPasswordEnc: true } });
  if (!existing) throw new SubscriptionNotFoundError();

  const settings = await getSettings();
  return db.subscription.update({
    where: { id },
    data: toBaseData(input, settings.timezone),
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
 */
export async function createImportedSubscription(params: {
  customerId: string;
  supplierId: string;
  priceCents: bigint;
  costCents: bigint;
  nextDueAt: Date;
  startedAt: Date;
  accessUsername: string | null;
  accessPassword: string | null;
  screens: number;
}): Promise<{ id: string }> {
  return db.subscription.create({
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
export async function findImportedSubscriptionBySupplier(params: {
  supplierId: string;
  accessUsername: string;
}): Promise<{ id: string } | null> {
  return db.subscription.findFirst({
    where: { supplierId: params.supplierId, accessUsername: params.accessUsername },
    select: { id: true },
  });
}
