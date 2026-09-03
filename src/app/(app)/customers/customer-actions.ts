'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/auth';
import { customerFichaSchema } from '@/features/customers/ficha-schema';
import { findCustomerIdByPhone, softDeleteCustomer } from '@/features/customers/service';
import { DomainError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { messages } from '@/lib/messages';
import { saveCustomerWithSubscription } from './customer-onboarding';
import { anonymizeCustomer } from './customer-anonymization';
import type { SaveCustomerFicha, FindCustomerByPhone } from '@/features/customers/ficha-types';

type ActionResult = { ok: true } | { error: { code: string; message: string } };

/**
 * Gravação da ficha — cria ou edita cliente **e** assinatura num commit só.
 * O drawer recebe esta ação por prop, o que é o que permite a mesma gaveta
 * abrir de Início, Clientes, Cobranças, Mensagens e Leads.
 */
export const saveCustomerFichaAction: SaveCustomerFicha = async (input, ids) => {
  try {
    await requireSession();
    const parsed = customerFichaSchema.safeParse(input);
    if (!parsed.success) {
      return { error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? messages.common.invalidInput } };
    }

    const result = await saveCustomerWithSubscription({ ...ids, values: parsed.data });
    revalidatePath('/customers');
    revalidatePath(`/customers/${result.customerId}`);
    return { ok: true, ...result };
  } catch (err) {
    if (err instanceof DomainError) return { error: { code: err.code, message: err.message } };
    logger.error({ route: 'customers.saveFicha', error: String(err), stack: err instanceof Error ? err.stack : undefined });
    return { error: { code: 'UNEXPECTED', message: messages.common.unexpectedError } };
  }
};

/**
 * "Essa pessoa já está na base?" — consultado ao abrir a conversão de um lead,
 * antes do operador preencher a assinatura. Devolve só id e nome: nada de
 * telefone, credencial ou qualquer campo que a tela não precise.
 */
export const findCustomerByPhoneAction: FindCustomerByPhone = async (phone) => {
  await requireSession();
  return findCustomerIdByPhone(phone);
};

/**
 * Direito de eliminação (LGPD) — irreversível. A tela já exige digitação do
 * nome do cliente antes de chamar isto; aqui é só sessão, chamada e
 * revalidação, igual toda Server Action (`.claude/rules/02-servidor.md`).
 */
export async function anonymizeCustomerAction(customerId: string): Promise<ActionResult> {
  try {
    const user = await requireSession();
    await anonymizeCustomer(customerId, user.id, new Date());
    revalidatePath('/customers');
    revalidatePath(`/customers/${customerId}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof DomainError) return { error: { code: err.code, message: err.message } };
    logger.error({ route: 'customers.anonymize', error: String(err), stack: err instanceof Error ? err.stack : undefined });
    return { error: { code: 'UNEXPECTED', message: messages.common.unexpectedError } };
  }
}

/**
 * "Remover" na tabela de clientes — soft delete, não o direito de eliminação
 * (esse é `anonymizeCustomerAction`, na ficha). Some da lista, dado continua
 * intacto no banco.
 */
export async function softDeleteCustomerAction(customerId: string): Promise<ActionResult> {
  try {
    await requireSession();
    await softDeleteCustomer(customerId, new Date());
    revalidatePath('/customers');
    return { ok: true };
  } catch (err) {
    if (err instanceof DomainError) return { error: { code: err.code, message: err.message } };
    logger.error({ route: 'customers.softDelete', error: String(err), stack: err instanceof Error ? err.stack : undefined });
    return { error: { code: 'UNEXPECTED', message: messages.common.unexpectedError } };
  }
}
