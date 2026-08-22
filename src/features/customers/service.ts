import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { DomainError, isUniqueViolation } from '@/lib/errors';
import type { z } from 'zod';
import type { customerSchema } from './schema';

type CustomerInput = z.infer<typeof customerSchema>;

export class CustomerPhoneTakenError extends DomainError {
  constructor(cause?: unknown) {
    super('Já existe um cliente com esse telefone.', 'CUSTOMER_PHONE_TAKEN', { cause });
  }
}

function toData(input: CustomerInput) {
  return {
    name: input.name,
    phone: input.phone || null,
    email: input.email || null,
    document: input.document || null,
    notes: input.notes || null,
  };
}

/**
 * Cria o cliente dentro de uma transação em curso — cadastrar um cliente
 * **com** assinatura (ficha nova, conversão de lead) precisa de um commit só:
 * dois commits deixam cliente sem assinatura se houver crash no meio, e o
 * operador cadastra de novo.
 */
export async function insertCustomer(tx: Prisma.TransactionClient, input: CustomerInput) {
  try {
    return await tx.customer.create({ data: toData(input) });
  } catch (err) {
    if (isUniqueViolation(err)) throw new CustomerPhoneTakenError(err);
    throw err;
  }
}

/** Telefone é `@@unique` — é ele que responde "essa pessoa já está na base?". */
export function findCustomerIdByPhone(phone: string): Promise<{ id: string; name: string } | null> {
  return db.customer.findUnique({ where: { phone }, select: { id: true, name: true } });
}

/** Contraparte de `insertCustomer` para a edição — mesma razão de existir. */
export async function patchCustomer(tx: Prisma.TransactionClient, id: string, input: CustomerInput) {
  try {
    return await tx.customer.update({ where: { id }, data: toData(input) });
  } catch (err) {
    if (isUniqueViolation(err)) throw new CustomerPhoneTakenError(err);
    throw err;
  }
}
