import { addDays, addMonths, startOfMonth } from 'date-fns';
import { TZDate } from '@date-fns/tz';

export type BillingCycle = 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL';

export const CYCLE_MONTHS: Record<BillingCycle, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  SEMIANNUAL: 6,
  ANNUAL: 12,
};

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** Dia efetivo do vencimento naquele mês, respeitando o dia desejado. */
export function resolveDueDay(desiredDay: number, year: number, month: number): number {
  return Math.min(desiredDay, daysInMonth(year, month));
}

/** 23:59:59.999 local convertido para UTC. */
export function endOfLocalDay(year: number, month: number, day: number, timezone: string): Date {
  const local = new TZDate(year, month, day, 23, 59, 59, 999, timezone);
  return new Date(local.getTime());
}

/** 00:00:00.000 local convertido para UTC. */
export function startOfLocalDay(year: number, month: number, day: number, timezone: string): Date {
  const local = new TZDate(year, month, day, 0, 0, 0, 0, timezone);
  return new Date(local.getTime());
}

/** Verifica se o instante cai dentro de [startHour, endHour) no fuso local. */
export function isWithinLocalHourRange(instant: Date, startHour: number, endHour: number, timezone: string): boolean {
  const local = new TZDate(instant, timezone);
  const hour = local.getHours() + local.getMinutes() / 60;
  return hour >= startHour && hour < endHour;
}

/** Próximo instante dentro de [startHour, endHour) no fuso local, a partir de `now`.
 *  Se `now` já está dentro da janela, retorna o início do dia SEGUINTE — T6 só reagenda pra frente,
 *  nunca é chamada com um `now` dentro da janela em uso normal (ver isWithinLocalHourRange no chamador). */
export function nextQuietHourStart(now: Date, startHour: number, endHour: number, timezone: string): Date {
  const local = new TZDate(now, timezone);
  const hourFraction = local.getHours() + local.getMinutes() / 60;
  const base = hourFraction < startHour ? local : addDays(local, 1);
  const target = new TZDate(base.getFullYear(), base.getMonth(), base.getDate(), startHour, 0, 0, 0, timezone);
  return new Date(target.getTime());
}

function computeDueDate(referenceLocal: TZDate, cycle: BillingCycle, timezone: string): Date {
  const target = addMonths(startOfMonth(referenceLocal), CYCLE_MONTHS[cycle]);
  const day = resolveDueDay(referenceLocal.getDate(), target.getFullYear(), target.getMonth());
  return endOfLocalDay(target.getFullYear(), target.getMonth(), day, timezone);
}

/**
 * Vencimento do próximo ciclo. A âncora é **a data mais tarde** entre o
 * vencimento que estava em aberto e o dia em que o cliente pagou:
 *
 * - pagou **antes** do vencimento → conta do vencimento (vence 10, pagou 05 → 10 do mês seguinte)
 * - pagou **depois** → conta do pagamento (vence 10, pagou 12 → 12 do mês seguinte)
 *
 * Regra do operador (11/09/2026). Antes contava sempre do pagamento, e quem
 * pagava adiantado perdia os dias adiantados: pagar dia 5 de um vencimento dia
 * 10 jogava o vencimento seguinte para o dia 5, e no mês seguinte para o dia 1 —
 * o vencimento andava para trás sozinho, mês a mês, em toda a base que paga
 * antes. Pagar adiantado nunca pode custar dias ao cliente.
 *
 * A comparação é em **dia local**, não em instante: `dueAt` é 23:59:59 do dia e
 * `paidAt` é 00:00, então comparar os dois crus diria que um pagamento feito no
 * próprio dia do vencimento veio antes dele.
 */
export function nextDueDate(params: {
  paidAt: Date;
  /** Vencimento da cobrança que está sendo quitada. */
  currentDueAt: Date;
  cycle: BillingCycle;
  timezone: string;
}): Date {
  const paidDay = localDateOnly(params.paidAt, params.timezone);
  const dueDay = localDateOnly(params.currentDueAt, params.timezone);
  const anchor = paidDay.getTime() > dueDay.getTime() ? params.paidAt : params.currentDueAt;

  return computeDueDate(new TZDate(anchor, params.timezone), params.cycle, params.timezone);
}

/** Vencimento da primeira cobrança, sem pagamento anterior. */
export function firstDueDate(params: { startedAt: Date; cycle: BillingCycle; timezone: string }): Date {
  const local = new TZDate(params.startedAt, params.timezone);
  return computeDueDate(local, params.cycle, params.timezone);
}

/**
 * Início do período coberto por uma cobrança que vence em `dueAt`: um ciclo
 * para trás, em data local sem hora (`@db.Date`).
 *
 * Existe para a cobrança que nasce de um vencimento já conhecido, sem
 * pagamento anterior de onde derivar o período — a importação da base, onde a
 * planilha traz só o vencimento atual. Voltar do vencimento, e não partir de
 * `startedAt`, é o que evita um `periodStart` de anos atrás (a coluna CRIAÇÃO
 * da planilha é a data em que o assinante entrou, não o início do ciclo).
 */
export function periodStartForDue(params: { dueAt: Date; cycle: BillingCycle; timezone: string }): Date {
  const local = new TZDate(params.dueAt, params.timezone);
  const back = addMonths(local, -CYCLE_MONTHS[params.cycle]);
  return localDateOnly(new Date(back.getTime()), params.timezone);
}

/**
 * Início (inclusive) e fim (exclusivo) do dia de `instant`, em UTC, no fuso do
 * negócio. É o recorte que o SQL usa para separar "em atraso" (`dueAt < from`)
 * de "vence hoje" (`from <= dueAt < to`) sem repetir a regra de fuso dentro da
 * query — o mesmo corte que `daysFromDue` faz em memória.
 */
export function localDayBoundsUtc(instant: Date, timezone: string): { from: Date; to: Date } {
  return { from: localDayStartUtc(instant, timezone), to: localDayStartUtc(instant, timezone, 1) };
}

/**
 * 00:00 local do dia de `instant` deslocado em `days` dias, convertido para UTC.
 * `days` 0 = hoje, 1 = amanhã, 4 = daqui a quatro dias.
 *
 * Anda no calendário local (`getDate() + days`), não somando 24h ao instante:
 * num fuso com horário de verão o dia tem 23 ou 25 horas, e a soma em
 * milissegundos cairia no dia errado justamente na virada.
 */
export function localDayStartUtc(instant: Date, timezone: string, days = 0): Date {
  const local = new TZDate(instant, timezone);
  return startOfLocalDay(local.getFullYear(), local.getMonth(), local.getDate() + days, timezone);
}

/** Início (inclusive) e fim (exclusivo) do mês, em UTC, no fuso do negócio. */
export function monthBoundsUtc(year: number, month: number, timezone: string): { from: Date; to: Date } {
  const from = new TZDate(year, month, 1, 0, 0, 0, 0, timezone);
  const to = new TZDate(year, month + 1, 1, 0, 0, 0, 0, timezone);
  return { from: new Date(from.getTime()), to: new Date(to.getTime()) };
}

/** Data local sem hora (meia-noite UTC do dia local), para colunas @db.Date. */
export function localDateOnly(instant: Date, timezone: string): Date {
  const local = new TZDate(instant, timezone);
  return new Date(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()));
}

/** Diferença em dias de calendário local entre duas datas, nunca negativa. */
export function daysBetweenLocalDates(from: Date, to: Date, timezone: string): number {
  const fromLocal = localDateOnly(from, timezone);
  const toLocal = localDateOnly(to, timezone);
  const diffMs = toLocal.getTime() - fromLocal.getTime();
  return Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
}

function isoDateString(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Recorte padrão do filtro de data: os últimos `days` dias corridos no fuso
 * do negócio, terminando hoje — ambos em `YYYY-MM-DD` local, prontos pra
 * `searchParams`. `now` entra por parâmetro pra manter a função pura.
 */
export function defaultDateRangeLocal(now: Date, timezone: string, days = 30): { from: string; to: string } {
  const today = new TZDate(now, timezone);
  const start = addDays(today, -(days - 1));
  return {
    from: isoDateString(start.getFullYear(), start.getMonth(), start.getDate()),
    to: isoDateString(today.getFullYear(), today.getMonth(), today.getDate()),
  };
}

/**
 * `YYYY-MM-DD` que existe no calendário. A regex sozinha aceita `2026-02-31`,
 * e `TZDate` com dia 31 em fevereiro rola silenciosamente para março — o
 * pagamento entraria com data três dias adiante da digitada, e o vencimento
 * do ciclo seguinte junto.
 */
export function isValidCalendarDate(dateStr: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  return day <= daysInMonth(year, month - 1);
}

/**
 * `YYYY-MM-DD` local vira o instante de 00:00 daquele dia no fuso do negócio.
 *
 * Não passar pelo meio-dia UTC seguido de `localDateOnly`: nesse caminho,
 * meia-noite UTC do dia informado já cai no dia anterior em fusos negativos
 * (America/Sao_Paulo, UTC-3), e `localDateOnly` reconfirma o dia errado. O
 * resultado seria o dia do mês usado por `nextDueDate` saindo um dia adiantado
 * do que o operador digitou.
 */
export function localDayStartFromIso(dateStr: string, timezone: string): Date {
  if (!isValidCalendarDate(dateStr)) throw new RangeError(`Data local inválida: ${dateStr}`);
  const [year, month, day] = dateStr.split('-').map(Number);
  return startOfLocalDay(year, month - 1, day, timezone);
}
