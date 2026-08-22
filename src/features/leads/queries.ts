import type { LeadStatus, Prisma } from '@prisma/client';
import { db } from '@/lib/db';

export interface LeadListRowDTO {
  id: string;
  name: string;
  /** E.164. A tela formata — o banco guarda o canônico. */
  phone: string;
  interestPlan: string | null;
  source: string;
  status: LeadStatus;
  createdAt: string;
  customerId: string | null;
}

export interface LeadListParams {
  page: number;
  perPage: 8 | 12 | 20;
  q?: string;
  status?: LeadStatus;
}

/**
 * Busca por nome, telefone ou origem (placeholder da tela).
 *
 * O telefone é guardado em E.164 e digitado formatado: quem procura por
 * "(62) 99180" nunca casaria com "+5562991802244". Por isso a parte numérica
 * da busca vira dígitos antes de ir para o `contains`.
 */
function buildWhere(params: LeadListParams): Prisma.LeadWhereInput {
  const where: Prisma.LeadWhereInput = {};
  if (params.status) where.status = params.status;

  const q = params.q?.trim();
  if (!q) return where;

  const digits = q.replace(/\D/g, '');
  where.OR = [
    { name: { contains: q, mode: 'insensitive' } },
    { source: { contains: q, mode: 'insensitive' } },
    ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
  ];
  return where;
}

export async function listLeads(params: LeadListParams): Promise<{ rows: LeadListRowDTO[]; total: number }> {
  const where = buildWhere(params);

  const [rows, total] = await Promise.all([
    db.lead.findMany({
      where,
      // Lead mais novo primeiro: a fila de trabalho é por chegada, e é a
      // ordem que o índice (status, createdAt) cobre — `EXPLAIN` com 20 mil
      // linhas dá Index Scan Backward, sem sort.
      //
      // A busca livre (`ILIKE '%x%'`) é seq scan: btree não cobre prefixo
      // aberto. Medido em 13ms com 20 mil leads, o que sobra folgado para a
      // escala do projeto. Se um dia pesar, o caminho é `pg_trgm` + índice
      // GIN, não paginação por cursor.
      orderBy: { createdAt: 'desc' },
      skip: (params.page - 1) * params.perPage,
      take: params.perPage,
      select: {
        id: true,
        name: true,
        phone: true,
        interestPlan: true,
        source: true,
        status: true,
        createdAt: true,
        customerId: true,
      },
    }),
    db.lead.count({ where }),
  ]);

  return {
    rows: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
    total,
  };
}

/** Total de leads na base, sem filtro — separa "ainda não chegou nenhum" de "o filtro não achou". */
export function countAllLeads(): Promise<number> {
  return db.lead.count();
}
