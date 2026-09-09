import { daysFromDue } from './dunning-rules';

export type DueDateBucket = 'D-5' | 'D-2' | 'D0' | 'D+1' | 'D+3' | 'D+5';

export const DUE_DATE_BUCKETS: readonly DueDateBucket[] = ['D-5', 'D-2', 'D0', 'D+1', 'D+3', 'D+5'];

/**
 * Quantos dias antes do vencimento a cobrança já conta como "chegando" — a
 * largura do balde D-2. Exportado porque a situação do cliente
 * (`customer-situation.ts`) e o SQL do chip "Vence em breve"
 * (`features/customers/queries.ts`) precisam do mesmo corte: dois números
 * separados viram, na primeira mudança, uma tela dizendo uma coisa e o filtro
 * trazendo outra.
 */
export const DUE_SOON_DAYS = 3;

/** Classifica uma cobrança pelo balde de vencimento, ancorado em `now`.
 *  offset negativo = a vencer; positivo = atrasada. Intervalos fechados, sem gap:
 *  D-5 ≤-4 · D-2 -3..-1 · D0 =0 · D+1 1..2 · D+3 3..4 · D+5 ≥5. */
export function resolveDueDateBucket(dueAt: Date, now: Date, timezone: string): DueDateBucket {
  const offset = daysFromDue(dueAt, now, timezone);
  if (offset < -DUE_SOON_DAYS) return 'D-5';
  if (offset <= -1) return 'D-2';
  if (offset === 0) return 'D0';
  if (offset <= 2) return 'D+1';
  if (offset <= 4) return 'D+3';
  return 'D+5';
}
