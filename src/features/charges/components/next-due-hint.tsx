'use client';

import { type BillingCycle } from '@/core/dates';
import { formatLocalDate } from '@/lib/format';
import { nextDuePreview } from './next-due-preview';

/**
 * Qual vencimento este pagamento abre — e o aviso quando ele já nasce vencido,
 * que é o caso de registrar hoje um pagamento feito semanas atrás. O operador
 * reportou isso como bug ("renovei e está em atraso") justamente por só ver a
 * consequência depois de confirmar.
 */
export function NextDueHint({ paidAt, cycle, timezone }: { paidAt: string; cycle: string; timezone: string }) {
  const preview = nextDuePreview({ paidAt, cycle: cycle as BillingCycle, timezone, now: new Date() });
  if (!preview) {
    return <p className="text-xs text-foreground-muted">Dia em que o cliente pagou. O próximo vencimento conta a partir dele.</p>;
  }

  const formatted = formatLocalDate(preview.dueAt.toISOString(), timezone);
  if (preview.daysLate === 0) {
    return <p className="text-xs text-foreground-muted">Próximo vencimento: {formatted}.</p>;
  }
  return (
    <p className="text-xs text-warning">
      Próximo vencimento: {formatted} — já vencido há {preview.daysLate}{' '}
      {preview.daysLate === 1 ? 'dia' : 'dias'}, porque o ciclo conta do dia do pagamento.
    </p>
  );
}
