import { isValidCalendarDate, localDayStartFromIso, nextDueDate, type BillingCycle } from '@/core/dates';
import { daysFromDue } from '@/core/dunning-rules';

/**
 * O vencimento que o pagamento vai abrir, calculado enquanto o operador digita
 * a data. Nasce de um relato real: ele registrou hoje um pagamento que o
 * cliente fez em 10/08, o ciclo mensal venceu 10/09 — ontem — e o cliente
 * apareceu na lista como `Em atraso · 1d` na mesma hora. Não é bug (a regra é
 * "pagamento + ciclo", CLAUDE.md §Data e fuso), mas ele só via a consequência
 * depois de confirmar, e reportou como defeito.
 *
 * Usa a **mesma** `nextDueDate` do service, nunca uma conta paralela: prévia
 * que diverge do que é gravado é pior que prévia nenhuma.
 */
export function nextDuePreview(params: {
  paidAt: string;
  cycle: BillingCycle;
  timezone: string;
  now: Date;
}): { dueAt: Date; daysLate: number } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.paidAt) || !isValidCalendarDate(params.paidAt)) return null;

  const dueAt = nextDueDate({
    paidAt: localDayStartFromIso(params.paidAt, params.timezone),
    cycle: params.cycle,
    timezone: params.timezone,
  });
  return { dueAt, daysLate: Math.max(0, daysFromDue(dueAt, params.now, params.timezone)) };
}
