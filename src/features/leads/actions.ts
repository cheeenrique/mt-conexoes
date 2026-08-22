'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '@/features/auth/service';
import { DomainError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { messages } from '@/lib/messages';
import { manualLeadSchema, setLeadStatusSchema } from './schema';
import { createManualLead, setLeadStatus } from './service';

// ⚠️ `convertLeadAction` **não** mora aqui: converter cria cliente, assinatura
// e a primeira cobrança, o que cruza três features. A composição só é
// permitida em `app/` — ver `app/(app)/leads/convert-lead-action.ts`.

type ActionError = { error: { code: string; message: string } };
type ActionResult = { ok: true } | ActionError;

export async function createLeadAction(input: unknown): Promise<ActionResult> {
  try {
    await requireSession();
    const parsed = manualLeadSchema.safeParse(input);
    if (!parsed.success) return validationError(parsed.error.issues[0]?.message);

    await createManualLead(parsed.data);
    revalidatePath('/leads');
    return { ok: true };
  } catch (err) {
    return handle('leads.create', err);
  }
}

export async function setLeadStatusAction(input: unknown): Promise<ActionResult> {
  try {
    await requireSession();
    const parsed = setLeadStatusSchema.safeParse(input);
    if (!parsed.success) return validationError(parsed.error.issues[0]?.message);

    await setLeadStatus(parsed.data.leadId, parsed.data.status);
    revalidatePath('/leads');
    return { ok: true };
  } catch (err) {
    return handle('leads.setStatus', err);
  }
}

function validationError(message: string | undefined): ActionError {
  return { error: { code: 'VALIDATION', message: message ?? messages.common.invalidInput } };
}

function handle(route: string, err: unknown): ActionError {
  if (err instanceof DomainError) return { error: { code: err.code, message: err.message } };
  logger.error({ route, error: String(err), stack: err instanceof Error ? err.stack : undefined });
  return { error: { code: 'UNEXPECTED', message: messages.common.unexpectedError } };
}
