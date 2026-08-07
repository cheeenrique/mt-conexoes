import { db } from '@/lib/db';
import { DomainError } from '@/lib/errors';
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
    phone: input.phone,
    email: input.email || null,
    document: input.document || null,
    notes: input.notes || null,
  };
}

export async function createCustomer(input: CustomerInput) {
  try {
    return await db.customer.create({ data: toData(input) });
  } catch (err) {
    if (isUniqueViolation(err)) throw new CustomerPhoneTakenError(err);
    throw err;
  }
}

export async function updateCustomer(id: string, input: CustomerInput) {
  try {
    return await db.customer.update({ where: { id }, data: toData(input) });
  } catch (err) {
    if (isUniqueViolation(err)) throw new CustomerPhoneTakenError(err);
    throw err;
  }
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === 'P2002';
}
