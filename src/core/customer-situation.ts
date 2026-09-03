import { daysFromDue } from './dunning-rules';

/**
 * Situação do cliente na lista (handoff `telas/03-clientes.md` §"Situações
 * possíveis"). Derivada, nunca persistida: depende de `now` e do fuso do
 * negócio, então uma coluna no banco estaria errada todo dia às 00:00 local.
 *
 * `NO_SUBSCRIPTION` não está no handoff. Entrou porque a base tem cliente sem
 * assinatura viva (cadastrado e ainda não vendido, ou com assinatura
 * cancelada), e chamá-lo de "Ativo" seria inventar um estado que o dado não
 * tem — o antipadrão de motivo inventado na tela de Mensagens.
 */
export type CustomerSituation =
  | 'ACTIVE'
  | 'DUE_TODAY'
  | 'OVERDUE'
  | 'OPEN'
  | 'SUSPENDED'
  | 'NO_SUBSCRIPTION'
  | 'ANONYMIZED'
  | 'DELETED';

/** As cinco situações que viram chip de filtro na tela de Clientes. `ANONYMIZED`
 * e `DELETED` mudam o comportamento padrão da lista: escondidos a menos que o
 * operador clique no chip (ver `queries.ts`). `DELETED` é soft delete
 * ("Remover" na tabela) — diferente de `ANONYMIZED` (direito de eliminação,
 * LGPD): aqui o dado continua intacto, só sai da lista e da régua. */
export const CUSTOMER_SITUATION_FILTERS = ['ACTIVE', 'DUE_TODAY', 'OVERDUE', 'ANONYMIZED', 'DELETED'] as const;

export type CustomerSituationFilter = (typeof CUSTOMER_SITUATION_FILTERS)[number];

export function isCustomerSituationFilter(value: string): value is CustomerSituationFilter {
  return (CUSTOMER_SITUATION_FILTERS as readonly string[]).includes(value);
}

/**
 * `subscriptionStatus` é o da assinatura mais relevante do cliente (ACTIVE
 * ganha de SUSPENDED, que ganha de CANCELLED). `openChargeDueAt` é o
 * vencimento da cobrança em aberto **mais antiga** — é ela que decide entre
 * atraso e vencimento de hoje quando o cliente deve mais de um ciclo.
 *
 * "Vence hoje" e "em atraso" são conceitos locais: a comparação sai de
 * `daysFromDue`, que trunca as duas pontas no fuso do negócio.
 */
export function resolveCustomerSituation(params: {
  subscriptionStatus: 'ACTIVE' | 'SUSPENDED' | 'CANCELLED' | null;
  openChargeDueAt: Date | null;
  now: Date;
  timezone: string;
  /** Direito de eliminação (LGPD) — ganha de tudo o mais: um cliente anonimizado
   * não tem mais assinatura nem cobrança que valha a pena mostrar. */
  anonymizedAt?: Date | null;
  /** Soft delete ("Remover" na tabela) — ganha de tudo, menos de `anonymizedAt`:
   * se as duas aconteceram (removeu, depois alguém achou pelo chip e anonimizou
   * de verdade), o nome já virou "Cliente anonimizado" — mostrar "Removido" ali
   * seria informar menos do que se sabe. */
  deletedAt?: Date | null;
}): CustomerSituation {
  if (params.anonymizedAt) return 'ANONYMIZED';
  if (params.deletedAt) return 'DELETED';
  if (params.subscriptionStatus === null || params.subscriptionStatus === 'CANCELLED') {
    return 'NO_SUBSCRIPTION';
  }
  if (params.subscriptionStatus === 'SUSPENDED') return 'SUSPENDED';
  if (params.openChargeDueAt === null) return 'ACTIVE';

  const offset = daysFromDue(params.openChargeDueAt, params.now, params.timezone);
  if (offset > 0) return 'OVERDUE';
  if (offset === 0) return 'DUE_TODAY';
  return 'OPEN';
}
