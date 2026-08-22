import { daysBetweenLocalDates } from '@/core/dates';
import { formatLocalDayMonth, formatLocalTime } from '@/lib/format';

export interface DunningRunSummaryInput {
  status: string;
  lastRunAt: string | null;
  lastRunMessagesSent: number | null;
  lastRunPendingReview: number | null;
}

/**
 * Linha de resumo do cabeçalho da régua (handoff `telas/07-reguas.md`:
 * "Última passada hoje às 07:00 · 3 mensagens"). `null` só para DRAFT — o
 * motor nem avalia rascunho, não há passada para resumir.
 *
 * REVIEW e ACTIVE/PAUSED usam unidades diferentes de propósito: uma passada
 * em REVIEW nunca cria Message (calcula e para — CLAUDE.md §Régua — travas),
 * então "N mensagens" ali seria inventado. O número mostrado em REVIEW é
 * quantos passos foram para revisão, não mensagem enviada.
 */
export function formatRunSummary(rule: DunningRunSummaryInput, timezone: string, now: Date): string | null {
  if (rule.status === 'DRAFT') return null;
  if (!rule.lastRunAt) return 'Ainda sem passada do motor.';

  const lastRunAt = new Date(rule.lastRunAt);
  const when = formatWhen(lastRunAt, now, timezone);
  const time = formatLocalTime(rule.lastRunAt, timezone);

  if (rule.status === 'REVIEW') {
    const count = rule.lastRunPendingReview ?? 0;
    const label = count === 1 ? 'passo em revisão' : 'passos em revisão';
    return `Última passada ${when} às ${time} · calculou ${count} ${label}`;
  }

  const prefix = rule.status === 'PAUSED' ? 'Antes de pausar, última' : 'Última';
  const count = rule.lastRunMessagesSent ?? 0;
  const label = count === 1 ? 'mensagem enviada' : 'mensagens enviadas';
  return `${prefix} passada ${when} às ${time} · ${count} ${label}`;
}

function formatWhen(lastRunAt: Date, now: Date, timezone: string): string {
  const diffDays = daysBetweenLocalDates(lastRunAt, now, timezone);
  if (diffDays === 0) return 'hoje';
  if (diffDays === 1) return 'ontem';
  return formatLocalDayMonth(lastRunAt.toISOString(), timezone);
}
