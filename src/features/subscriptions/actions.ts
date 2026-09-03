'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { subscriptionSchema, changeSubscriptionPlanSchema } from './schema';
import { createSubscription, updateSubscription, revealCredential, changeSubscriptionPlan } from './service';
import { requireSession } from '@/lib/auth';
import { DomainError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { messages } from '@/lib/messages';

type ActionResult = { ok: true } | { error: { code: string; message: string } };
type RevealResult = { ok: true; value: string } | { error: { code: string; message: string } };

export async function createSubscriptionAction(customerId: string, input: unknown): Promise<ActionResult> {
  try {
    await requireSession();
    const parsed = subscriptionSchema.safeParse(input);
    if (!parsed.success) {
      return { error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? messages.common.invalidInput } };
    }

    await createSubscription(customerId, parsed.data);
    revalidatePath(`/customers/${customerId}`);
    return { ok: true as const };
  } catch (err) {
    if (err instanceof DomainError) return { error: { code: err.code, message: err.message } };
    logger.error({ route: 'subscriptions.create', error: String(err), stack: err instanceof Error ? err.stack : undefined });
    return { error: { code: 'UNEXPECTED', message: messages.common.unexpectedError } };
  }
}

export async function updateSubscriptionAction(id: string, customerId: string, input: unknown): Promise<ActionResult> {
  try {
    await requireSession();
    const parsed = subscriptionSchema.safeParse(input);
    if (!parsed.success) {
      return { error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? messages.common.invalidInput } };
    }

    await updateSubscription(id, parsed.data);
    revalidatePath(`/customers/${customerId}`);
    return { ok: true as const };
  } catch (err) {
    if (err instanceof DomainError) return { error: { code: err.code, message: err.message } };
    logger.error({ route: 'subscriptions.update', error: String(err), stack: err instanceof Error ? err.stack : undefined });
    return { error: { code: 'UNEXPECTED', message: messages.common.unexpectedError } };
  }
}

/** Ação rápida da coluna "Plano" na tabela de Clientes — clica na linha, troca, salva. */
export async function changePlanAction(subscriptionId: string, customerId: string, planId: unknown): Promise<ActionResult> {
  try {
    await requireSession();
    const parsed = changeSubscriptionPlanSchema.safeParse({ planId });
    if (!parsed.success) {
      return { error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? messages.common.invalidInput } };
    }

    await changeSubscriptionPlan(subscriptionId, customerId, parsed.data.planId);
    revalidatePath('/customers');
    revalidatePath(`/customers/${customerId}`);
    return { ok: true as const };
  } catch (err) {
    if (err instanceof DomainError) return { error: { code: err.code, message: err.message } };
    logger.error({ route: 'subscriptions.changePlan', error: String(err), stack: err instanceof Error ? err.stack : undefined });
    return { error: { code: 'UNEXPECTED', message: messages.common.unexpectedError } };
  }
}

export async function revealCredentialAction(subscriptionId: string): Promise<RevealResult> {
  try {
    const user = await requireSession();
    const ip = (await headers()).get('x-forwarded-for');
    const value = await revealCredential(subscriptionId, user.id, ip);
    return { ok: true as const, value };
  } catch (err) {
    if (err instanceof DomainError) return { error: { code: err.code, message: err.message } };
    logger.error({ route: 'subscriptions.revealCredential', error: String(err), stack: err instanceof Error ? err.stack : undefined });
    return { error: { code: 'UNEXPECTED', message: messages.common.unexpectedError } };
  }
}
