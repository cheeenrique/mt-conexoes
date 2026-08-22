'use server';

import { revalidatePath } from 'next/cache';
import type { z } from 'zod';
import {
  createDunningRuleSchema,
  dunningRuleStatusSchema,
  dunningStepSchema,
  renameDunningRuleSchema,
} from './schema';
import { createStep, updateStep, deleteStep, activateDunningRule } from './service';
import { createRule, renameRule, setDefaultRule, setRuleStatus } from './rule.service';
import { requireSession } from '@/lib/auth';
import { DomainError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { messages } from '@/lib/messages';

type ActionResult<T = undefined> = { ok: true; data: T } | { error: { code: string; message: string } };

class ValidationError extends DomainError {
  constructor(message: string | undefined) {
    super(message ?? messages.common.invalidInput, 'VALIDATION');
  }
}

function parseOrThrow<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message);
  return parsed.data;
}

/**
 * Casca comum das Server Actions da régua: sessão, execução, revalidação e
 * tradução do erro. Server Action é endpoint HTTP público — passar o
 * `requireSession()` por aqui garante o guard em todas, na ordem certa
 * (sessão antes de validar), em vez de depender de ninguém esquecer a linha na
 * oitava action.
 *
 * `revalidatePath` roda depois do service, nunca dentro da transação.
 */
async function run<T>(route: string, fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    await requireSession();
    const data = await fn();
    revalidatePath('/dunning');
    return { ok: true, data };
  } catch (err) {
    if (err instanceof DomainError) return { error: { code: err.code, message: err.message } };
    logger.error({ route, error: String(err), stack: err instanceof Error ? err.stack : undefined });
    return { error: { code: 'UNEXPECTED', message: messages.common.unexpectedError } };
  }
}

export async function createDunningStepAction(ruleId: string, input: unknown): Promise<ActionResult<void>> {
  return run('dunning.createStep', async () => {
    await createStep(ruleId, parseOrThrow(dunningStepSchema, input));
  });
}

export async function updateDunningStepAction(id: string, input: unknown): Promise<ActionResult<void>> {
  return run('dunning.updateStep', async () => {
    await updateStep(id, parseOrThrow(dunningStepSchema, input));
  });
}

export async function deleteDunningStepAction(id: string): Promise<ActionResult<void>> {
  return run('dunning.deleteStep', async () => {
    await deleteStep(id);
  });
}

export async function activateDunningRuleAction(
  ruleId: string,
  mode: 'send-all' | 'ignore-retroactive',
): Promise<ActionResult<void>> {
  return run('dunning.activateRule', async () => {
    await activateDunningRule(ruleId, mode);
  });
}

export async function createDunningRuleAction(input: unknown): Promise<ActionResult<{ ruleId: string }>> {
  return run('dunning.createRule', async () => {
    const { id } = await createRule(parseOrThrow(createDunningRuleSchema, input));
    return { ruleId: id };
  });
}

export async function renameDunningRuleAction(id: string, input: unknown): Promise<ActionResult<void>> {
  return run('dunning.renameRule', async () => {
    await renameRule(id, parseOrThrow(renameDunningRuleSchema, input).name);
  });
}

export async function setDefaultDunningRuleAction(id: string): Promise<ActionResult<void>> {
  return run('dunning.setDefaultRule', async () => {
    await setDefaultRule(id);
  });
}

export async function setDunningRuleStatusAction(id: string, input: unknown): Promise<ActionResult<void>> {
  return run('dunning.setRuleStatus', async () => {
    await setRuleStatus(id, parseOrThrow(dunningRuleStatusSchema, input).status);
  });
}
