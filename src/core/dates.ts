import { addMonths, startOfMonth } from 'date-fns';
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

function computeDueDate(referenceLocal: TZDate, cycle: BillingCycle, timezone: string): Date {
  const target = addMonths(startOfMonth(referenceLocal), CYCLE_MONTHS[cycle]);
  const day = resolveDueDay(referenceLocal.getDate(), target.getFullYear(), target.getMonth());
  return endOfLocalDay(target.getFullYear(), target.getMonth(), day, timezone);
}

/** Vencimento do próximo ciclo, a partir de quando o ciclo atual foi pago. */
export function nextDueDate(params: { paidAt: Date; cycle: BillingCycle; timezone: string }): Date {
  const local = new TZDate(params.paidAt, params.timezone);
  return computeDueDate(local, params.cycle, params.timezone);
}

/** Vencimento da primeira cobrança, sem pagamento anterior. */
export function firstDueDate(params: { startedAt: Date; cycle: BillingCycle; timezone: string }): Date {
  const local = new TZDate(params.startedAt, params.timezone);
  return computeDueDate(local, params.cycle, params.timezone);
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
