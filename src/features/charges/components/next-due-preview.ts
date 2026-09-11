import { isValidCalendarDate, localDayStartFromIso, nextDueDate, type BillingCycle } from '@/core/dates';
import { daysFromDue } from '@/core/dunning-rules';

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * O vencimento que a regra sugere para o próximo ciclo, em `YYYY-MM-DD` local,
 * pronto para preencher o campo do diálogo.
 *
 * A âncora é a mais tarde entre o vencimento em aberto e o dia do pagamento
 * (`nextDueDate`, em `core/`) — a mesma função que o service usa para gravar.
 * Sugestão que diverge do que seria gravado é pior que sugestão nenhuma.
 */
export function suggestNextDueAt(params: {
  paidAt: string;
  currentDueAt: Date;
  cycle: BillingCycle;
  timezone: string;
}): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.paidAt) || !isValidCalendarDate(params.paidAt)) return null;

  const due = nextDueDate({
    paidAt: localDayStartFromIso(params.paidAt, params.timezone),
    currentDueAt: params.currentDueAt,
    cycle: params.cycle,
    timezone: params.timezone,
  });
  // Volta para o dia local: `dueAt` é 23:59:59 no fuso do negócio, e em
  // America/Sao_Paulo isso já caiu no dia seguinte em UTC.
  const local = new Date(due.getTime() - 1000);
  const iso = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: params.timezone,
  }).format(local);
  return iso;
}

/**
 * Há quantos dias o vencimento escolhido já passou — 0 quando está hoje ou no
 * futuro. É o que dispara o aviso do diálogo: registrar hoje um pagamento feito
 * semanas atrás abre um ciclo que já nasce vencido, e o operador reportou isso
 * como bug por só descobrir depois de confirmar.
 */
export function daysAlreadyLate(params: { nextDueAt: string; timezone: string; now: Date }): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.nextDueAt) || !isValidCalendarDate(params.nextDueAt)) return null;

  const due = localDayStartFromIso(params.nextDueAt, params.timezone);
  return Math.max(0, daysFromDue(due, params.now, params.timezone));
}
