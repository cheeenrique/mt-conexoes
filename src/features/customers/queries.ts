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
  /** Ausente sem assinatura nenhuma — a edição rápida de plano na tabela some nesse caso. */
  subscriptionId: string | null;
  planId: string | null;
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

  // ANONYMIZED e DELETED não caem aqui — `listCustomers` já resolve os dois
  // antes de chamar esta função (ver o comentário lá).
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

export async function listCustomers(params: {
  page: number;
  perPage: PerPage;
  q?: string;
  situation?: CustomerSituationFilter;
  planId?: string;
  supplierId?: string;
  now: Date;
  timezone: string;
}): Promise<{ rows: CustomerListRowDTO[]; total: number }> {
  const and: Prisma.CustomerWhereInput[] = [];
  if (params.q) and.push(searchWhere(params.q));
  if (params.planId) and.push({ subscriptions: { some: { planId: params.planId } } });
  if (params.supplierId) and.push({ subscriptions: { some: { supplierId: params.supplierId } } });

  // ANONYMIZED e DELETED não passam por `situationWhere`: aquela função
  // pressupõe assinatura ativa em todo branch, e nenhum dos dois estados tem
  // uma (anonimizar exige cancelar antes; remover não mexe na assinatura, mas
  // não faz sentido cruzar com "vence hoje"/"em atraso" — o cliente já saiu do
  // fluxo de cobrança do dia a dia). Os dois somem da lista por padrão; o chip
  // exato é o único jeito de trazer de volta.
  if (params.situation === 'ANONYMIZED') {
    and.push({ anonymizedAt: { not: null } });
  } else if (params.situation === 'DELETED') {
    // Sem `anonymizedAt: null` aqui, um cliente removido e depois anonimizado
    // apareceria nos dois chips — ANONYMIZED já ganha a exibição (ver
    // `resolveCustomerSituation`), então some daqui pra não duplicar.
    and.push({ deletedAt: { not: null }, anonymizedAt: null });
  } else {
    and.push({ anonymizedAt: null, deletedAt: null });
    if (params.situation) and.push(situationWhere(params.situation, params.now, params.timezone));
  }
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
        subscriptionId: sub?.id ?? null,
        planId: sub?.planId ?? null,
        planName: sub?.plan?.name ?? null,
        supplierName: sub?.supplier?.name ?? null,
        nextDueAt: (openChargeDueAt ?? sub?.nextDueAt)?.toISOString() ?? null,
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
      deletedAt: row.deletedAt,
    }),
  };
}
