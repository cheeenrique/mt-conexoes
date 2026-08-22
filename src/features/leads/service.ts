import type { Lead, LeadStatus, Prisma } from '@prisma/client';
import type { z } from 'zod';
import { db } from '@/lib/db';
import { DomainError, isRecordNotFound } from '@/lib/errors';
import type { manualLeadSchema } from './schema';

export class LeadNotFoundError extends DomainError {
  constructor(cause?: unknown) {
    super('Este lead não existe mais.', 'LEAD_NOT_FOUND', { cause });
  }
}

export class LeadAlreadyConvertedError extends DomainError {
  constructor(cause?: unknown) {
    super('Este lead já foi convertido em cliente.', 'LEAD_ALREADY_CONVERTED', { cause });
  }
}

export interface CreateLeadInput {
  name: string;
  phone: string;
  source: string;
  city?: string;
  interestPlan?: string;
  campaign?: string;
  landingPath?: string;
  note?: string;
}

/**
 * ⚠️ Nenhuma checagem de telefone repetido, de propósito — ver o comentário
 * do modelo `Lead` no schema. Duplicidade é decisão do operador na tela.
 */
export function createLead(input: CreateLeadInput): Promise<Lead> {
  return db.lead.create({ data: input });
}

export function createManualLead(input: z.infer<typeof manualLeadSchema>): Promise<Lead> {
  return createLead(input);
}

export async function setLeadStatus(leadId: string, status: Exclude<LeadStatus, 'CONVERTED'>): Promise<void> {
  try {
    await db.lead.update({ where: { id: leadId }, data: { status } });
  } catch (err) {
    if (isRecordNotFound(err)) throw new LeadNotFoundError(err);
    throw err;
  }
}

/**
 * O lead pode virar cliente? Roda **antes** de abrir a transação de conversão:
 * lead inexistente ou já convertido é decisão de domínio de leads, e não faz
 * sentido segurar uma transação de três escritas para descobrir isso.
 */
export async function assertLeadConvertible(leadId: string): Promise<Lead> {
  const lead = await db.lead.findUnique({ where: { id: leadId } });
  if (!lead) throw new LeadNotFoundError();
  if (lead.status === 'CONVERTED') throw new LeadAlreadyConvertedError();
  return lead;
}

/**
 * Marca o lead como convertido e guarda o vínculo com o cliente.
 *
 * ⚠️ Recebe o cliente de transação: a marcação tem que cair no mesmo commit
 * que a criação do cliente e da assinatura. Dois commits deixam cliente órfão
 * e lead ainda `Novo` se houver crash no meio — o operador converte de novo e
 * viram dois cadastros da mesma pessoa.
 *
 * O lead **não some da lista** (handoff 08): muda de situação e ganha o link.
 */
export async function markLeadConverted(
  tx: Prisma.TransactionClient,
  leadId: string,
  customerId: string,
): Promise<void> {
  await tx.lead.update({ where: { id: leadId }, data: { status: 'CONVERTED', customerId } });
}
