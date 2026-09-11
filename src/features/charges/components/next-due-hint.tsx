'use client';

import { daysAlreadyLate } from './next-due-preview';

/**
 * Aviso do campo "Próximo vencimento": some quando a data está hoje ou à
 * frente, e alerta quando já nasce vencida — o caso de registrar hoje um
 * pagamento feito semanas atrás, que o operador reportou como bug em
 * 11/09/2026 por só descobrir depois de confirmar.
 */
export function NextDueHint({ nextDueAt, timezone }: { nextDueAt: string; timezone: string }) {
  const daysLate = daysAlreadyLate({ nextDueAt, timezone, now: new Date() });

  if (daysLate === null) {
    return <p className="text-xs text-foreground-muted">Sugerido pela regra do ciclo. Pode trocar.</p>;
  }
  if (daysLate === 0) {
    return <p className="text-xs text-foreground-muted">Sugerido pela regra do ciclo. Pode trocar.</p>;
  }
  return (
    <p className="text-xs text-warning">
      Já vencido há {daysLate} {daysLate === 1 ? 'dia' : 'dias'} — o cliente volta para a lista em atraso. Troque a data
      se combinou outro prazo.
    </p>
  );
}
