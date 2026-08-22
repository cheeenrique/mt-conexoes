'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/auth';
import { customerFichaSchema } from '@/features/customers/ficha-schema';
import { DomainError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { messages } from '@/lib/messages';
import { convertLeadToCustomer } from './convert-lead';
import type { SaveCustomerFicha } from '@/features/customers/ficha-types';

/**
 * Mesma assinatura de `saveCustomerFichaAction`: a gaveta de novo cliente não
 * sabe que veio de um lead, ela só recebe a ação de gravar por prop. Aqui o
 * `leadId` viaja em `ids` e a marcação do lead entra na mesma transação.
 */
export const convertLeadAction: SaveCustomerFicha = async (input, ids) => {
  try {
    await requireSession();
    const parsed = customerFichaSchema.safeParse(input);
    if (!parsed.success) {
      return { error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? messages.common.invalidInput } };
    }
    if (!ids.leadId) return { error: { code: 'VALIDATION', message: 'Lead inválido.' } };

    const result = await convertLeadToCustomer(ids.leadId, parsed.data);
    revalidatePath('/leads');
    revalidatePath('/customers');
    return { ok: true, ...result };
  } catch (err) {
    if (err instanceof DomainError) return { error: { code: err.code, message: err.message } };
    logger.error({ route: 'leads.convert', error: String(err), stack: err instanceof Error ? err.stack : undefined });
    return { error: { code: 'UNEXPECTED', message: messages.common.unexpectedError } };
  }
};
