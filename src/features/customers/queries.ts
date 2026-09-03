import { db } from '@/lib/db';
import { localDayBoundsUtc } from '@/core/dates';
import { phoneSearchDigits } from '@/core/phone';
import {
  resolveCustomerSituation,
  type CustomerSituation,
  type CustomerSituationFilter,
} from '@/core/customer-situation';
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
  planName: string | null;
  supplierName: string | null;
  /** Vencimento da cobrança em aberto mais antiga; sem cobrança em aberto, o da assinatura. */
  nextDueAt: string | null;
  situation: CustomerSituation;
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

/** Cobrança que ainda pesa no cliente. `PAID`/`CANCELLED` não entram. */
const OPEN_CHARGE_STATUSES = ['OPEN', 'OVERDUE', 'PARTIALLY_PAID'] as const;

function searchWhere(q: string): Prisma.CustomerWhereInput {
  const digits = phoneSearchDigits(q);
  const or: Prisma.CustomerWhereInput[] = [
    { name: { contains: q, mode: 'insensitive' } },
    { subscriptions: { some: { accessUsername: { contains: q, mode: 'insensitive' } } } },
  ];
  // O telefone é guardado em E.164 (`+5562998133401`); comparar `(62) 99813`
  // cru contra ele nunca casa. Normaliza para dígitos antes de procurar.
  if (digits) or.push({ phone: { contains: digits } });
  return { OR: or };
}

/**
 * Recorte de cada chip, escrito como predicado de banco. Espelha
 * `resolveCustomerSituation`: as fronteiras de dia saem de `localDayBoundsUtc`,
 * não de comparação em UTC, e o `none` de atraso em `DUE_TODAY` reproduz a
 * precedência de "cobrança em aberto mais antiga manda" — sem ele, quem deve
 * agosto e setembro apareceria no chip errado.
 */
function situationWhere(
  situation: CustomerSituationFilter,
  now: Date,
  timezone: string,
): Prisma.CustomerWhereInput {
  const { from, to } = localDayBoundsUtc(now, timezone);
  const status = { in: [...OPEN_CHARGE_STATUSES] };
  const activeSubscription: Prisma.CustomerWhereInput = {
    subscriptions: { some: { status: 'ACTIVE' } },
  };

  // ANONYMIZED não cai aqui: o `and.push` único em `listCustomers` já cobre os
  // dois lados (esconder por padrão, mostrar só quando o chip pede) — duplicar
  // a condição aqui seria a mesma regra escrita em dois lugares.
  if (situation === 'ACTIVE') {
    return { ...activeSubscription, charges: { none: { status } } };
  }
  if (situation === 'OVERDUE') {
    return { ...activeSubscription, charges: { some: { status, dueAt: { lt: from } } } };
  }
  return {
    ...activeSubscription,
    charges: { some: { status, dueAt: { gte: from, lt: to } }, none: { status, dueAt: { lt: from } } },
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
      status: true,
      nextDueAt: true,
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

export async function listCustomers(params: {
  page: number;
  perPage: PerPage;
  q?: string;
  situation?: CustomerSituationFilter;
  now: Date;
  timezone: string;
}): Promise<{ rows: CustomerListRowDTO[]; total: number }> {
  const and: Prisma.CustomerWhereInput[] = [];
  if (params.q) and.push(searchWhere(params.q));
  // ANONYMIZED não passa por `situationWhere`: aquela função pressupõe
  // assinatura ativa em todo branch, e cliente anonimizado nunca tem uma (é
  // pré-condição da trava de anonimizar) — cairia num predicado que nunca bate.
  if (params.situation && params.situation !== 'ANONYMIZED') {
    and.push(situationWhere(params.situation, params.now, params.timezone));
  }
  // Direito de eliminação (LGPD): anonimizado só aparece se o chip pediu
  // exatamente ele — some da lista (e de qualquer outro chip) por padrão.
  and.push({ anonymizedAt: params.situation === 'ANONYMIZED' ? { not: null } : null });
  const where: Prisma.CustomerWhereInput = and.length > 0 ? { AND: and } : {};

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
        planName: sub?.plan?.name ?? null,
        supplierName: sub?.supplier?.name ?? null,
        nextDueAt: (openChargeDueAt ?? sub?.nextDueAt)?.toISOString() ?? null,
        situation: resolveCustomerSituation({
          subscriptionStatus: (sub?.status as SubscriptionStatus | undefined) ?? null,
          openChargeDueAt,
          now: params.now,
          timezone: params.timezone,
          anonymizedAt: row.anonymizedAt,
        }),
      };
    }),
    total,
  };
}

export interface CustomerHeadDTO extends CustomerDTO {
  situation: CustomerSituation;
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
  const oldest = await db.subscription.findFirst({
    where: { customerId: id },
    orderBy: { startedAt: 'asc' },
    select: { startedAt: true },
  });

  return {
    ...toDTO(row),
    supplierName: sub?.supplier?.name ?? null,
    sinceAt: oldest?.startedAt.toISOString() ?? null,
    situation: resolveCustomerSituation({
      subscriptionStatus: (sub?.status as SubscriptionStatus | undefined) ?? null,
      openChargeDueAt: row.charges[0]?.dueAt ?? null,
      now,
      timezone,
      anonymizedAt: row.anonymizedAt,
    }),
  };
}
