import { db } from '@/lib/db';
import { DomainError } from '@/lib/errors';
import { encrypt, decrypt } from '@/lib/crypto';
import { firstDueDate } from '@/core/dates';
import { getSettings } from '@/features/settings/queries';
import type { z } from 'zod';
import type { subscriptionSchema } from './schema';

type SubscriptionInput = z.infer<typeof subscriptionSchema>;

export class SubscriptionNotFoundError extends DomainError {
  constructor(cause?: unknown) {
    super('Assinatura não encontrada.', 'SUBSCRIPTION_NOT_FOUND', { cause });
  }
}

function toBaseData(input: SubscriptionInput) {
  return {
    planId: input.planId || null,
    supplierId: input.supplierId || null,
    priceCents: BigInt(input.priceCents),
    costCents: BigInt(input.costCents),
    cycle: input.cycle,
    discountType: input.discountType || null,
    discountValue: input.discountValue ? input.discountValue : null,
    discountUntil: input.discountUntil ? new Date(input.discountUntil) : null,
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
      ...toBaseData(input),
    },
  });
}

export async function updateSubscription(id: string, input: SubscriptionInput) {
  const existing = await db.subscription.findUnique({ where: { id } });
  if (!existing) throw new SubscriptionNotFoundError();

  return db.subscription.update({
    where: { id },
    data: toBaseData(input),
  });
}

export async function revealCredential(subscriptionId: string, userId: string, ip: string | null) {
  const subscription = await db.subscription.findUnique({ where: { id: subscriptionId } });
  if (!subscription) throw new SubscriptionNotFoundError();
  if (!subscription.accessPasswordEnc) return '';

  await db.credentialReveal.create({ data: { subscriptionId, userId, ip } });
  return decrypt(subscription.accessPasswordEnc, 'subscription.accessPassword');
}
