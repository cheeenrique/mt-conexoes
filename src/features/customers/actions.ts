'use server';

import { revalidatePath } from 'next/cache';
import { customerSchema } from './schema';
import { createCustomer, updateCustomer } from './service';
import { requireSession } from '@/features/auth/service';
import { DomainError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { messages } from '@/lib/messages';

type ActionResult = { ok: true } | { error: { code: string; message: string } };

export async function createCustomerAction(input: unknown): Promise<ActionResult> {
  try {
    await requireSession();
    const parsed = customerSchema.safeParse(input);
    if (!parsed.success) {
      return { error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? messages.common.invalidInput } };
    }

    await createCustomer(parsed.data);
    revalidatePath('/customers');
    return { ok: true as const };
  } catch (err) {
    if (err instanceof DomainError) return { error: { code: err.code, message: err.message } };
    logger.error({ route: 'customers.create', error: String(err), stack: err instanceof Error ? err.stack : undefined });
    return { error: { code: 'UNEXPECTED', message: messages.common.unexpectedError } };
  }
}

export async function updateCustomerAction(id: string, input: unknown): Promise<ActionResult> {
  try {
    await requireSession();
    const parsed = customerSchema.safeParse(input);
    if (!parsed.success) {
      return { error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? messages.common.invalidInput } };
    }

    await updateCustomer(id, parsed.data);
    revalidatePath('/customers');
    revalidatePath(`/customers/${id}`);
    return { ok: true as const };
  } catch (err) {
    if (err instanceof DomainError) return { error: { code: err.code, message: err.message } };
    logger.error({ route: 'customers.update', error: String(err), stack: err instanceof Error ? err.stack : undefined });
    return { error: { code: 'UNEXPECTED', message: messages.common.unexpectedError } };
  }
}
