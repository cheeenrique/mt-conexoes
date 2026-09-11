import { db } from '@/lib/db';
import { daysFromDue } from '@/core/dunning-rules';
import {
  CUSTOMER_TRIAGE_SITUATIONS,
  resolveCustomerSituation,
  type CustomerSituation,
  type CustomerTriageSituation,
} from '@/core/customer-situation';
import { listWhere, OPEN_CHARGE_STATUSES, type CustomerListFilters } from './list-filters';
import type { Prisma, SubscriptionStatus } from '@prisma/client';
import type { PerPage } from '@/components/ui/data-table-paging';

export interface CustomerDTO {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  document: string | null;
  notes: string | null;
}

export interface CustomerListRowDTO extends CustomerDTO {
  /** Ausente sem assinatura nenhuma — a edição rápida de plano na tabela some nesse caso. */
  subscriptionId: string | null;
  planId: string | null;
  planName: string | null;
  supplierName: string | null;
  /** Vencimento da cobrança em aberto mais antiga; sem cobrança em aberto, o da assinatura. */
  nextDueAt: string | null;
  situation: CustomerSituation;
  /** Offset em dias da cobrança em aberto mais antiga: positivo atrasada, negativo a vencer.
   *  Alimenta o contador do badge ("Em atraso · 34d"); nulo sem cobrança em aberto. */
  daysFromDue: number | null;
}

function toDTO(row: {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  document: string | null;
  notes: string | null;
}): CustomerDTO {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    document: row.document,
    notes: row.notes,
  };
}

// `orderBy: { status: 'asc' }` usa a ordem de declaração do enum no Postgres
// (ACTIVE, SUSPENDED, CANCELLED): a assinatura que decide a linha é a ativa; na
// falta dela, a suspensa. `take: 1` em relação vira window function no SQL do
// Prisma — uma query para todas as linhas da página, não uma por cliente.
const LIST_INCLUDE = {
  subscriptions: {
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: 1,
    select: {
      id: true,
      status: true,
      nextDueAt: true,
      planId: true,
      plan: { select: { name: true } },
      supplier: { select: { name: true } },
    },
  },
  charges: {
    where: { status: { in: [...OPEN_CHARGE_STATUSES] } },
    orderBy: { dueAt: 'asc' },
    take: 1,
    select: { dueAt: true },
  },
} satisfies Prisma.CustomerInclude;

export async function listCustomers(
  params: CustomerListFilters & { page: number; perPage: PerPage },
): Promise<{ rows: CustomerListRowDTO[]; total: number }> {
  const where = listWhere(params);

  const [rows, total] = await Promise.all([
    db.customer.findMany({
      where,
      orderBy: { name: 'asc' },
      skip: (params.page - 1) * params.perPage,
      take: params.perPage,
      include: LIST_INCLUDE,
    }),
    db.customer.count({ where }),
  ]);

  return {
    rows: rows.map((row) => {
      const sub = row.subscriptions[0];
      const openChargeDueAt = row.charges[0]?.dueAt ?? null;
      return {
        ...toDTO(row),
        subscriptionId: sub?.id ?? null,
        planId: sub?.planId ?? null,
        planName: sub?.plan?.name ?? null,
        supplierName: sub?.supplier?.name ?? null,
        nextDueAt: (openChargeDueAt ?? sub?.nextDueAt)?.toISOString() ?? null,
        daysFromDue: openChargeDueAt ? daysFromDue(openChargeDueAt, params.now, params.timezone) : null,
        situation: resolveCustomerSituation({
          subscriptionStatus: (sub?.status as SubscriptionStatus | undefined) ?? null,
          openChargeDueAt,
          now: params.now,
          timezone: params.timezone,
          anonymizedAt: row.anonymizedAt,
          deletedAt: row.deletedAt,
        }),
      };
    }),
    total,
  };
}

export type CustomerSituationCounts = Record<CustomerTriageSituation | 'ALL', number>;

/**
 * Quantos clientes em cada degrau, para a barra de triagem. É o número que
 * responde "tem alguém atrasado?" sem obrigar o operador a clicar chip por
 * chip — a pergunta que ele faz toda vez que abre a tela.
 *
 * Conta com os mesmos filtros da lista (busca, plano, fornecedor), só variando
 * a situação: contador que ignora o filtro em vigor mente. `ALL` é o total da
 * lista sem chip de situação, não a soma dos degraus — cliente suspenso ou sem
 * assinatura aparece na lista e em degrau nenhum.
 *
 * Cinco `count` em paralelo, todos cobertos pelo índice `(status, dueAt)` de
 * `charges`. Na escala do projeto (até 1.000 assinantes) é mais barato que
 * carregar as linhas para contar em memória.
 */
export async function countCustomerSituations(params: CustomerListFilters): Promise<CustomerSituationCounts> {
  const [all, ...ladder] = await Promise.all([
    db.customer.count({ where: listWhere({ ...params, situation: undefined }) }),
    ...CUSTOMER_TRIAGE_SITUATIONS.map((situation) =>
      db.customer.count({ where: listWhere({ ...params, situation }) }),
    ),
  ]);

  return CUSTOMER_TRIAGE_SITUATIONS.reduce(
    (acc, situation, index) => ({ ...acc, [situation]: ladder[index] }),
    { ALL: all } as CustomerSituationCounts,
  );
}

export interface CustomerHeadDTO extends CustomerDTO {
  situation: CustomerSituation;
  /** T5: o cliente pediu para não receber mensagem. Global, em todos os canais. */
  optedOut: boolean;
  optedOutAt: string | null;
  optedOutReason: string | null;
  /** Mesmo offset da lista, para o badge da ficha mostrar o contador de dias. */
  daysFromDue: number | null;
  supplierName: string | null;
  /** Mês/ano do início da assinatura mais antiga, para "cliente desde". */
  sinceAt: string | null;
}

/** Cabeçalho da ficha: os mesmos campos derivados da lista, para um cliente só. */
export async function getCustomerHead(
  id: string,
  now: Date,
  timezone: string,
): Promise<CustomerHeadDTO | null> {
  const row = await db.customer.findUnique({ where: { id }, include: LIST_INCLUDE });
  if (!row) return null;

  const sub = row.subscriptions[0];
  const openChargeDueAt = row.charges[0]?.dueAt ?? null;
  const oldest = await db.subscription.findFirst({
    where: { customerId: id },
    orderBy: { startedAt: 'asc' },
    select: { startedAt: true },
  });

  return {
    ...toDTO(row),
    optedOut: row.optedOut,
    optedOutAt: row.optedOutAt?.toISOString() ?? null,
    optedOutReason: row.optedOutReason,
    supplierName: sub?.supplier?.name ?? null,
    sinceAt: oldest?.startedAt.toISOString() ?? null,
    daysFromDue: openChargeDueAt ? daysFromDue(openChargeDueAt, now, timezone) : null,
    situation: resolveCustomerSituation({
      subscriptionStatus: (sub?.status as SubscriptionStatus | undefined) ?? null,
      openChargeDueAt,
      now,
      timezone,
      anonymizedAt: row.anonymizedAt,
      deletedAt: row.deletedAt,
    }),
  };
}
