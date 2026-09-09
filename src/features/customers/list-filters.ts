import type { Prisma } from '@prisma/client';
import { localDayStartUtc } from '@/core/dates';
import { phoneSearchDigits } from '@/core/phone';
import { DUE_SOON_DAYS } from '@/core/due-date-buckets';
import type { CustomerSituationFilter } from '@/core/customer-situation';

/**
 * Como recortar a base de clientes: busca, chip de situação, plano, fornecedor
 * e o esconde-anonimizado. Separado de `queries.ts` porque muda por outro
 * motivo — chip novo ou regra de recorte diferente mexe aqui, coluna nova na
 * lista mexe lá — e porque a lista, a contagem da barra de triagem e a ficha
 * precisam do mesmo predicado sem duplicá-lo.
 */

/** Cobrança que ainda pesa no cliente. `PAID`/`CANCELLED` não entram. */
export const OPEN_CHARGE_STATUSES = ['OPEN', 'OVERDUE', 'PARTIALLY_PAID'] as const;

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
 * `resolveCustomerSituation` degrau a degrau: as fronteiras de dia saem de
 * `localDayStartUtc`, não de comparação em UTC, e o corte de "vence em breve"
 * é o mesmo `DUE_SOON_DAYS` que a situação usa — um número só entre a tela e
 * o filtro.
 *
 * Cada degrau leva um `none` do degrau anterior porque quem manda é a cobrança
 * em aberto **mais antiga**: sem isso, quem deve agosto e vence de novo em
 * setembro apareceria em dois chips ao mesmo tempo.
 */
function situationWhere(
  situation: CustomerSituationFilter,
  now: Date,
  timezone: string,
): Prisma.CustomerWhereInput {
  const todayStart = localDayStartUtc(now, timezone);
  const tomorrowStart = localDayStartUtc(now, timezone, 1);
  const soonEnd = localDayStartUtc(now, timezone, DUE_SOON_DAYS + 1);
  const status = { in: [...OPEN_CHARGE_STATUSES] };
  const activeSubscription: Prisma.CustomerWhereInput = {
    subscriptions: { some: { status: 'ACTIVE' } },
  };

  // ANONYMIZED e DELETED não caem aqui — `listCustomers` já resolve os dois
  // antes de chamar esta função (ver o comentário lá).
  if (situation === 'NO_CHARGE') {
    return { ...activeSubscription, charges: { none: { status } } };
  }
  if (situation === 'OVERDUE') {
    return { ...activeSubscription, charges: { some: { status, dueAt: { lt: todayStart } } } };
  }
  if (situation === 'DUE_TODAY') {
    return {
      ...activeSubscription,
      charges: {
        some: { status, dueAt: { gte: todayStart, lt: tomorrowStart } },
        none: { status, dueAt: { lt: todayStart } },
      },
    };
  }
  if (situation === 'DUE_SOON') {
    return {
      ...activeSubscription,
      charges: {
        some: { status, dueAt: { gte: tomorrowStart, lt: soonEnd } },
        none: { status, dueAt: { lt: tomorrowStart } },
      },
    };
  }
  return {
    ...activeSubscription,
    charges: { some: { status, dueAt: { gte: soonEnd } }, none: { status, dueAt: { lt: soonEnd } } },
  };
}

export interface CustomerListFilters {
  q?: string;
  situation?: CustomerSituationFilter;
  planId?: string;
  supplierId?: string;
  now: Date;
  timezone: string;
}

/**
 * O `where` completo da lista: busca, plano, fornecedor, o recorte de
 * anonimizado/removido e o chip de situação. Extraído porque a barra de
 * triagem conta os mesmos clientes com um `situation` diferente — os números
 * têm que respeitar a busca e os selects em vigor, senão o contador promete
 * 13 em atraso e a lista filtrada por fornecedor mostra 2.
 */
export function listWhere(params: CustomerListFilters): Prisma.CustomerWhereInput {
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
  return and.length > 0 ? { AND: and } : {};
}
