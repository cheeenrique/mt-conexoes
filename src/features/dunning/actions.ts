'use server';

import { revalidatePath } from 'next/cache';
import { dunningStepSchema } from './schema';
import { createStep, updateStep, deleteStep } from './service';
import { requireSession } from '@/features/auth/service';
import { DomainError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { messages } from '@/lib/messages';

type ActionResult = { ok: true } | { error: { code: string; message: string } };

export async function createDunningStepAction(ruleId: string, input: unknown): Promise<ActionResult> {
  try {
    await requireSession();
    const parsed = dunningStepSchema.safeParse(input);
    if (!parsed.success) {
      return { error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? messages.common.invalidInput } };
    }
    await createStep(ruleId, parsed.data);
    revalidatePath('/regua');
    return { ok: true as const };
  } catch (err) {
    if (err instanceof DomainError) return { error: { code: err.code, message: err.message } };
    logger.error({ route: 'dunning.createStep', error: String(err), stack: err instanceof Error ? err.stack : undefined });
    return { error: { code: 'UNEXPECTED', message: messages.common.unexpectedError } };
  }
}

export async function updateDunningStepAction(id: string, input: unknown): Promise<ActionResult> {
  try {
    await requireSession();
    const parsed = dunningStepSchema.safeParse(input);
    if (!parsed.success) {
      return { error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? messages.common.invalidInput } };
    }
    await updateStep(id, parsed.data);
    revalidatePath('/regua');
    return { ok: true as const };
  } catch (err) {
    if (err instanceof DomainError) return { error: { code: err.code, message: err.message } };
    logger.error({ route: 'dunning.updateStep', error: String(err), stack: err instanceof Error ? err.stack : undefined });
    return { error: { code: 'UNEXPECTED', message: messages.common.unexpectedError } };
  }
}

export async function deleteDunningStepAction(id: string): Promise<ActionResult> {
  try {
    await requireSession();
    await deleteStep(id);
    revalidatePath('/regua');
    return { ok: true as const };
  } catch (err) {
    if (err instanceof DomainError) return { error: { code: err.code, message: err.message } };
    logger.error({ route: 'dunning.deleteStep', error: String(err), stack: err instanceof Error ? err.stack : undefined });
    return { error: { code: 'UNEXPECTED', message: messages.common.unexpectedError } };
  }
}
