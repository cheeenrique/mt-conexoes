import { db } from '@/lib/db';
import { DomainError } from '@/lib/errors';
import { encrypt, decrypt } from '@/lib/crypto';
import { firstDueDate, endOfLocalDay } from '@/core/dates';
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

  return db.subscription.create({
    data: {
      customerId,
      startedAt,
      nextDueAt,
      ...toBaseData(input, settings.timezone),
    },
    omit: { accessPasswordEnc: true },
  });
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
