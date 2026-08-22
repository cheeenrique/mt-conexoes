'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '@/features/auth/service';
import { customerFichaSchema } from '@/features/customers/ficha-schema';
import { findCustomerIdByPhone } from '@/features/customers/service';
import { DomainError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { messages } from '@/lib/messages';
import { saveCustomerWithSubscription } from './customer-onboarding';
import type { SaveCustomerFicha, FindCustomerByPhone } from '@/features/customers/ficha-types';

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
