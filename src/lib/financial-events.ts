import type { FinancialEventEntity, FinancialEventKind, Prisma } from '@prisma/client';
import { db } from '@/lib/db';

/**
 * Rastro de mutação financeira. Infra, não regra: sabe escrever e ler a linha,
 * e nada sobre **quando** registrar — essa decisão fica no service, que é quem
 * conhece o domínio.
 *
 * Mora em `lib/` porque três features escrevem nele e feature não importa de
 * feature (`.claude/rules/01-arquitetura.md` §Matriz de import).
 *
 * ⚠️ Recebe o cliente de transação, nunca abre o seu: o evento vai no mesmo
 * commit da mutação que ele descreve. Fora disso, um rollback deixa o log
 * afirmando o que não aconteceu — e no caso da remoção de pagamento o log é o
 * único lugar onde aquele registro continua existindo.
 *
 * ⚠️ Centavos entram como string. Este payload é registro, jamais fonte de
 * saldo: todo total sai de `SUM` sobre `payments`/`charges`.
 */
export type FinancialEventPayload = Record<string, string | null>;

export interface RecordFinancialEventParams {
  customerId: string;
  entityType: FinancialEventEntity;
  entityId: string;
  kind: FinancialEventKind;
  before?: FinancialEventPayload;
  after?: FinancialEventPayload;
  /** Texto do operador. ⚠️ Pode conter nome de pessoa — a anonimização limpa. */
  reason?: string | null;
  userId?: string | null;
}

export interface FinancialEventRow {
  id: string;
  entityType: string;
  entityId: string;
  kind: string;
  before: FinancialEventPayload | null;
  after: FinancialEventPayload | null;
  reason: string | null;
  at: Date;
}

export async function recordFinancialEvent(
  tx: Prisma.TransactionClient,
  params: RecordFinancialEventParams,
): Promise<void> {
  await tx.financialEvent.create({
    data: {
      customerId: params.customerId,
      entityType: params.entityType,
      entityId: params.entityId,
      kind: params.kind,
      before: params.before ?? undefined,
      after: params.after ?? undefined,
      reason: params.reason || null,
      userId: params.userId || null,
    },
  });
}

/** Mais recente primeiro — é a ordem em que a ficha lê. */
export async function listFinancialEvents(customerId: string): Promise<FinancialEventRow[]> {
  const rows = await db.financialEvent.findMany({
    where: { customerId },
    orderBy: [{ at: 'desc' }, { id: 'desc' }],
  });

  return rows.map((row) => ({
    id: row.id,
    entityType: row.entityType,
    entityId: row.entityId,
    kind: row.kind,
    before: (row.before as FinancialEventPayload | null) ?? null,
    after: (row.after as FinancialEventPayload | null) ?? null,
    reason: row.reason,
    at: row.at,
  }));
}
