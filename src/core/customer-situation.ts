import { resolveDueDateBucket, type DueDateBucket } from './due-date-buckets';

/**
 * Situação do cliente na lista (`docs/projeto/design/02-handoff-painel.md`
 * §Clientes). Derivada, nunca persistida: depende de `now` e do fuso do
 * negócio, então uma coluna no banco estaria errada todo dia às 00:00 local.
 *
 * Os quatro primeiros formam uma escada única, ancorada na cobrança em aberto
 * **mais antiga** do cliente: `UP_TO_DATE → DUE_SOON → DUE_TODAY → OVERDUE`.
 * O corte entre os dois primeiros é o mesmo balde `D-2` da linha de vencimento
 * do Início (`DUE_SOON_DAYS`) — a tela de Clientes e o dashboard falam a
 * mesma língua de propósito.
 *
 * `NO_CHARGE` é anomalia, não saúde: a corrente garante uma cobrança em aberto
 * por assinatura ativa (o pagamento emite a próxima na mesma transação, e o
 * índice parcial `subscriptions_single_open_charge` impede uma segunda), então
 * chegar aqui significa cobrança cancelada à mão — ou uma assinatura que nasceu
 * sem cobrança, o buraco que a importação tinha. Já se chamou `ACTIVE` e vinha
 * em verde, o que fazia a base importada inteira parecer saudável enquanto
 * ninguém a cobrava.
 *
 * `NO_SUBSCRIPTION` entrou porque a base tem cliente sem
 * assinatura viva (cadastrado e ainda não vendido, ou com assinatura
 * cancelada), e chamá-lo de "em dia" seria inventar um estado que o dado não
 * tem — o antipadrão de motivo inventado na tela de Mensagens.
 */
export type CustomerSituation =
  | 'UP_TO_DATE'
  | 'DUE_SOON'
  | 'DUE_TODAY'
  | 'OVERDUE'
  | 'NO_CHARGE'
  | 'SUSPENDED'
  | 'NO_SUBSCRIPTION'
  | 'ANONYMIZED'
  | 'DELETED';

/**
 * As situações que viram chip de filtro na tela de Clientes: a escada de
 * cobrança inteira, mais a anomalia e os dois estados escondidos.
 *
 * `ANONYMIZED` e `DELETED` mudam o comportamento padrão da lista: escondidos a
 * menos que o operador clique no chip (ver `queries.ts`). `DELETED` é soft
 * delete ("Remover" na tabela) — diferente de `ANONYMIZED` (direito de
 * eliminação, LGPD): aqui o dado continua intacto, só sai da lista e da régua.
 *
 * `NO_SUBSCRIPTION` fica de fora: não é recorte da escada de cobrança, e o
 * operador chega nele pela busca.
 */
export const CUSTOMER_SITUATION_FILTERS = [
  'UP_TO_DATE',
  'DUE_SOON',
  'DUE_TODAY',
  'OVERDUE',
  'SUSPENDED',
  'NO_CHARGE',
  'ANONYMIZED',
  'DELETED',
] as const;

export type CustomerSituationFilter = (typeof CUSTOMER_SITUATION_FILTERS)[number];

/**
 * A escada, na ordem em que a barra de triagem a mostra. Separada dos demais
 * chips porque é o recorte que o operador olha todo dia — "quem preciso cobrar
 * hoje" — enquanto `NO_CHARGE`, `ANONYMIZED` e `DELETED` são administrativos e
 * moram no select "Outros".
 *
 * `SUSPENDED` fecha a escada em vez de ficar fora dela: o corte de acesso é o
 * último passo da régua, e o pagamento religa (`charges/service.ts`). Enquanto
 * ficava fora, o maior devedor da base — cortado há três meses — não aparecia
 * em degrau nenhum nem em contador nenhum.
 */
export const CUSTOMER_TRIAGE_SITUATIONS = ['UP_TO_DATE', 'DUE_SOON', 'DUE_TODAY', 'OVERDUE', 'SUSPENDED'] as const;

export type CustomerTriageSituation = (typeof CUSTOMER_TRIAGE_SITUATIONS)[number];

/** Os chips que sobram: fora da triagem diária, escondidos atrás de um select. */
export const CUSTOMER_OTHER_FILTERS = ['NO_CHARGE', 'ANONYMIZED', 'DELETED'] as const;

export function isCustomerSituationFilter(value: string): value is CustomerSituationFilter {
  return (CUSTOMER_SITUATION_FILTERS as readonly string[]).includes(value);
}

/**
 * Os três baldes de atraso viram um estado só: a granularidade do atraso é o
 * contador de dias no rótulo ("Em atraso · 34d"), não um estado a mais — dois
 * clientes atrasados fazem a mesma coisa na régua e na tela.
 */
const BUCKET_SITUATION: Record<DueDateBucket, CustomerSituation> = {
  'D-5': 'UP_TO_DATE',
  'D-2': 'DUE_SOON',
  D0: 'DUE_TODAY',
  'D+1': 'OVERDUE',
  'D+3': 'OVERDUE',
  'D+5': 'OVERDUE',
};

/**
 * `subscriptionStatus` é o da assinatura mais relevante do cliente (ACTIVE
 * ganha de SUSPENDED, que ganha de CANCELLED). `openChargeDueAt` é o
 * vencimento da cobrança em aberto **mais antiga** — é ela que decide o degrau
 * da escada quando o cliente deve mais de um ciclo.
 *
 * A escada inteira é conceito local: a comparação sai de `resolveDueDateBucket`
 * → `daysFromDue`, que trunca as duas pontas no fuso do negócio.
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
  if (params.openChargeDueAt === null) return 'NO_CHARGE';

  return BUCKET_SITUATION[resolveDueDateBucket(params.openChargeDueAt, params.now, params.timezone)];
}
