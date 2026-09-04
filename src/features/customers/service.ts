import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { DomainError } from '@/lib/errors';
import { ANONYMIZED_CUSTOMER_NAME } from '@/core/anonymization';
import type { z } from 'zod';
import type { customerSchema } from './schema';

type CustomerInput = z.infer<typeof customerSchema>;

export class CustomerNotFoundError extends DomainError {
  constructor(cause?: unknown) {
    super('Este cliente não existe mais.', 'CUSTOMER_NOT_FOUND', { cause });
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
  return tx.customer.create({ data: toData(input) });
}

/**
 * "Essa pessoa já está na base?" — telefone não é mais `@@unique` (migration
 * 00000000000020: duas pessoas cobradas separadamente podem dividir um
 * WhatsApp). `findFirst` com o cadastro mais antigo primeiro é só o palpite
 * pra avisar o operador antes de submeter — nunca uma trava; ele decide se
 * quer abrir esse cliente ou cadastrar mesmo assim.
 */
export function findCustomerIdByPhone(phone: string): Promise<{ id: string; name: string } | null> {
  return db.customer.findFirst({ where: { phone }, orderBy: { createdAt: 'asc' }, select: { id: true, name: true } });
}

/** Contraparte de `insertCustomer` para a edição — mesma razão de existir. */
export async function patchCustomer(tx: Prisma.TransactionClient, id: string, input: CustomerInput) {
  return tx.customer.update({ where: { id }, data: toData(input) });
}

/**
 * Resolve o `Customer` de uma linha da importação da planilha (Etapa 1c).
 * Consolida por telefone quando a linha tem telefone válido — o mesmo
 * cliente presente em duas planilhas de fornecedores diferentes vira um
 * `Customer` só. Sem telefone, cria um `Customer` novo por linha: não há
 * como saber se é "a mesma pessoa" de outra planilha sem telefone pra
 * comparar, e chutar seria pior que duplicar.
 *
 * ⚠️ Telefone não é mais `@@unique`. Se já existirem 2+ `Customer` com esse
 * telefone (cadastro manual explícito, "mesmo assim"), a linha da planilha
 * consolida no mais antigo — determinístico, mas é um palpite: a importação
 * não sabe qual dos dois cadastros é "a pessoa da planilha". Caso raro; o
 * comum é telefone com no máximo um `Customer`.
 */
export async function resolveImportedCustomer(
  tx: Prisma.TransactionClient,
  params: { name: string; phone: string | null },
): Promise<{ id: string }> {
  if (params.phone) {
    const existing = await tx.customer.findFirst({
      where: { phone: params.phone },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (existing) return existing;
    return tx.customer.create({ data: { name: params.name, phone: params.phone }, select: { id: true } });
  }
  return tx.customer.create({ data: { name: params.name, phone: null }, select: { id: true } });
}

/**
 * Direito de eliminação (LGPD) — o próprio `Customer`. Dentro de uma transação
 * em curso: a composição em `app/(app)/customers/customer-anonymization.ts`
 * junta este passo com os de assinatura, mensagem e lead num commit só — commit
 * parcial deixaria nome neutro e credencial de acesso ainda gravada, o pior dos
 * dois mundos. A trava (`assertAnonymizable`) já rodou antes de chegar aqui.
 */
/**
 * Soft delete — "Remover" na tabela de clientes. Diferente de
 * `anonymizeCustomerRow`: nenhum dado é apagado, só sai de vista. Sem trava:
 * não mexe em assinatura nem cobrança, então não há estado de negócio que
 * bloqueie (quem cobra continua sabendo cobrar — os guards em
 * `dunning/evaluate.ts` e `messaging/scheduled-dispatch.ts` é que param).
 * Idempotente: já removido não regrava `deletedAt` por cima.
 */
export async function softDeleteCustomer(id: string, now: Date): Promise<void> {
  const existing = await db.customer.findUnique({ where: { id }, select: { deletedAt: true } });
  if (!existing) throw new CustomerNotFoundError();
  if (existing.deletedAt) return;

  await db.customer.update({ where: { id }, data: { deletedAt: now } });
}

export async function anonymizeCustomerRow(
  tx: Prisma.TransactionClient,
  id: string,
  userId: string,
  now: Date,
): Promise<void> {
  await tx.customer.update({
    where: { id },
    data: {
      name: ANONYMIZED_CUSTOMER_NAME,
      phone: null,
      email: null,
      document: null,
      notes: null,
      anonymizedAt: now,
      anonymizedByUserId: userId,
    },
  });
}
