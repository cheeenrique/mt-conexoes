'use server';

import { revalidatePath } from 'next/cache';
import { planSchema } from './schema';
import { createPlan, updatePlan } from './service';
import { requireSession } from '@/features/auth/service';
import { DomainError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { messages } from '@/lib/messages';

type ActionResult = { ok: true } | { error: { code: string; message: string } };

export async function createPlanAction(input: unknown): Promise<ActionResult> {
  try {
    await requireSession();
    const parsed = planSchema.safeParse(input);
    if (!parsed.success) return { error: { code: 'VALIDATION', message: messages.common.invalidInput } };

    await createPlan(parsed.data);
    revalidatePath('/plans');
    return { ok: true as const };
  } catch (err) {
    if (err instanceof DomainError) return { error: { code: err.code, message: err.message } };
    logger.error({ route: 'plans.create', error: String(err), stack: err instanceof Error ? err.stack : undefined });
    return { error: { code: 'UNEXPECTED', message: messages.common.unexpectedError } };
  }
}

export async function updatePlanAction(id: string, input: unknown): Promise<ActionResult> {
  try {
    await requireSession();
    const parsed = planSchema.safeParse(input);
    if (!parsed.success) return { error: { code: 'VALIDATION', message: messages.common.invalidInput } };

    await updatePlan(id, parsed.data);
    revalidatePath('/plans');
    return { ok: true as const };
  } catch (err) {
    if (err instanceof DomainError) return { error: { code: err.code, message: err.message } };
    logger.error({ route: 'plans.update', error: String(err), stack: err instanceof Error ? err.stack : undefined });
    return { error: { code: 'UNEXPECTED', message: messages.common.unexpectedError } };
  }
}
