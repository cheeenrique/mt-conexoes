import { daysFromDue } from './dunning-rules';

export type DueDateBucket = 'D-5' | 'D-2' | 'D0' | 'D+1' | 'D+3' | 'D+5';

export const DUE_DATE_BUCKETS: readonly DueDateBucket[] = ['D-5', 'D-2', 'D0', 'D+1', 'D+3', 'D+5'];

/** Classifica uma cobrança pelo balde de vencimento, ancorado em `now`.
 *  offset negativo = a vencer; positivo = atrasada. Intervalos fechados, sem gap:
 *  D-5 ≤-4 · D-2 -3..-1 · D0 =0 · D+1 1..2 · D+3 3..4 · D+5 ≥5. */
export function resolveDueDateBucket(dueAt: Date, now: Date, timezone: string): DueDateBucket {
  const offset = daysFromDue(dueAt, now, timezone);
  if (offset <= -4) return 'D-5';
  if (offset <= -1) return 'D-2';
  if (offset === 0) return 'D0';
  if (offset <= 2) return 'D+1';
  if (offset <= 4) return 'D+3';
  return 'D+5';
}
