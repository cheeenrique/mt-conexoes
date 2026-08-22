/**
 * Camada pura da tela de Mensagens: rotulagem, agrupamento por dia e recorte de período.
 *
 * Vive na feature, e não em `core/`, só porque o escopo desta entrega não pode tocar
 * `src/core/**`. `resolvePeriodBounds` é aritmética de data local genérica e deveria
 * ser promovida para `core/dates.ts` — ver relatório de pendências.
 *
 * Nada aqui chama `new Date()`: o instante entra por parâmetro.
 */
import { endOfLocalDay, localDateOnly, startOfLocalDay } from '@/core/dates';

export type LogOutcome = 'SENT' | 'PENDING' | 'SKIPPED' | 'FAILED';
export type LogOrigin = 'RULE' | 'MANUAL';
export type PeriodKey = 'today' | '7d' | '30d' | 'all';
export type StatusKey = 'all' | 'sent' | 'pending' | 'skipped' | 'failed';

/**
 * Uma linha da tela. Duas origens de dado desembocam aqui:
 * - `MESSAGE`  — existe linha em `messages` (enviada, na fila, falhou ou cancelada).
 * - `EXECUTION` — a régua parou antes de montar a mensagem, então só existe
 *   `dunning_executions` com `outcome` SKIPPED/PENDING_REVIEW e sem `messageId`.
 *   Nesses casos `body` é `null`: nenhum texto chegou a ser montado.
 */
export interface MessageLogEntryDTO {
  id: string;
  source: 'MESSAGE' | 'EXECUTION';
  /** Quando o fato aconteceu: envio efetivo quando houve, senão a criação do registro. */
  occurredAt: string;
  customerId: string;
  customerName: string;
  origin: LogOrigin;
  stepLabel: string | null;
  outcome: LogOutcome;
  /** T6: a quiet hour empurrou o envio pra frente. Adiada ≠ pulada. */
  postponed: boolean;
  postponedToAt: string | null;
  /** Código cru gravado pelo job (`opted_out`, `stale`, ...). Nunca inventado aqui. */
  reasonCode: string | null;
  failReason: string | null;
  body: string | null;
}

export interface MessageLogTotals {
  total: number;
  sent: number;
  pending: number;
  skipped: number;
  failed: number;
}

export interface MessageLogDay {
  dayKey: string;
  heading: string;
  entries: MessageLogEntryDTO[];
  totals: MessageLogTotals;
}

export const PERIOD_OPTIONS: { value: PeriodKey; label: string }[] = [
  { value: 'today', label: 'Hoje' },
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
  { value: 'all', label: 'Tudo' },
];

export const STATUS_OPTIONS: { value: StatusKey; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'sent', label: 'Enviada' },
  { value: 'pending', label: 'Na fila' },
  { value: 'skipped', label: 'Pulada' },
  { value: 'failed', label: 'Falhou' },
];

const OUTCOME_BY_STATUS: Record<StatusKey, LogOutcome | null> = {
  all: null,
  sent: 'SENT',
  pending: 'PENDING',
  skipped: 'SKIPPED',
  failed: 'FAILED',
};

/**
 * Motivos que o job realmente grava hoje:
 * - `dunning_executions.reason` — evaluate.ts:82 (`review`), :86 (`opted_out`), :90 (`no_phone`), :152 (`daily_dedupe`)
 * - `messages.cancelReason`     — scheduled-dispatch.ts:62 (`stale`), :79 (`opted_out`), :88 (`charge_closed`), :93 (`daily_dedupe`)
 *
 * Código desconhecido aparece cru na tela de propósito: um texto bonito inventado aqui
 * esconderia divergência entre o que o job fez e o que a tela conta.
 */
const REASON_LABELS: Record<string, string> = {
  opted_out: 'cliente pediu para sair',
  no_phone: 'cliente sem telefone',
  daily_dedupe: 'já recebeu mensagem hoje',
  review: 'régua em revisão',
  stale: 'parada há mais de 24h na fila',
  charge_closed: 'cliente já pagou',
};

/** Folga entre `scheduledFor` (relógio do job) e `createdAt` (relógio do banco). */
const CLOCK_SKEW_MS = 60_000;

export function stepLabel(offsetDays: number): string {
  if (offsetDays === 0) return 'D0';
  return offsetDays > 0 ? `D+${offsetDays}` : `D${offsetDays}`;
}

/** Uma mensagem consolidada cobre vários passos (T7). Mostra o mais adiantado e conta o resto. */
export function stepLabels(offsets: number[]): string | null {
  if (offsets.length === 0) return null;
  const sorted = [...offsets].sort((a, b) => a - b);
  const first = stepLabel(sorted[0]);
  return sorted.length > 1 ? `${first} +${sorted.length - 1}` : first;
}

export function isPostponed(scheduledFor: Date, createdAt: Date): boolean {
  return scheduledFor.getTime() - createdAt.getTime() > CLOCK_SKEW_MS;
}

export function outcomeBadge(entry: MessageLogEntryDTO): {
  label: string;
  tone: 'success' | 'warning' | 'danger' | 'neutral';
} {
  switch (entry.outcome) {
    case 'SENT':
      return { label: 'Enviada', tone: 'success' };
    case 'FAILED':
      return { label: 'Falhou', tone: 'danger' };
    case 'PENDING':
      return entry.postponed ? { label: 'Adiada', tone: 'warning' } : { label: 'Na fila', tone: 'neutral' };
    case 'SKIPPED':
      return { label: 'Pulada', tone: 'neutral' };
  }
}

export function reasonText(entry: MessageLogEntryDTO): string | null {
  if (entry.outcome === 'SENT') return null;
  if (entry.outcome === 'FAILED') return entry.failReason ?? 'erro do provedor';
  if (entry.outcome === 'PENDING') {
    return entry.postponed ? 'fora do horário de envio' : 'aguardando o próximo envio';
  }
  if (!entry.reasonCode) return null;
  return REASON_LABELS[entry.reasonCode] ?? entry.reasonCode;
}

/** Rótulo do corpo: o handoff exige distinguir o que saiu do que só seria montado. */
export function bodyLabel(entry: MessageLogEntryDTO): string {
  return entry.outcome === 'SENT' ? 'Texto enviado' : 'Texto que seria enviado';
}

export function resultLabel(entry: MessageLogEntryDTO): string {
  return entry.outcome === 'SENT' ? 'Entrega' : 'Motivo';
}

// Uma lista de centenas de linhas formata hora e dia em todas elas: construir um
// Intl.DateTimeFormat por célula é o custo bobo que aparece no perfil da tela.
const timeFormatters = new Map<string, Intl.DateTimeFormat>();
const dayFormatters = new Map<string, Intl.DateTimeFormat>();

function cached(
  cache: Map<string, Intl.DateTimeFormat>,
  timezone: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const hit = cache.get(timezone);
  if (hit) return hit;
  const formatter = new Intl.DateTimeFormat('pt-BR', { ...options, timeZone: timezone });
  cache.set(timezone, formatter);
  return formatter;
}

export function formatLocalTime(iso: string, timezone: string): string {
  return cached(timeFormatters, timezone, { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
}

export function formatLocalDayHeading(iso: string, timezone: string): string {
  return cached(dayFormatters, timezone, { weekday: 'short', day: '2-digit', month: '2-digit' }).format(new Date(iso));
}

export function localDayKey(iso: string, timezone: string): string {
  return localDateOnly(new Date(iso), timezone).toISOString().slice(0, 10);
}

export function summarize(entries: MessageLogEntryDTO[]): MessageLogTotals {
  const totals: MessageLogTotals = { total: entries.length, sent: 0, pending: 0, skipped: 0, failed: 0 };
  for (const entry of entries) {
    if (entry.outcome === 'SENT') totals.sent++;
    else if (entry.outcome === 'PENDING') totals.pending++;
    else if (entry.outcome === 'SKIPPED') totals.skipped++;
    else totals.failed++;
  }
  return totals;
}

export function filterByStatus(entries: MessageLogEntryDTO[], status: StatusKey): MessageLogEntryDTO[] {
  const outcome = OUTCOME_BY_STATUS[status];
  return outcome ? entries.filter((entry) => entry.outcome === outcome) : entries;
}

/**
 * Agrupa por dia **do fuso do negócio** — a decisão central da tela é "o que aconteceu
 * ontem", não "linhas 20 a 40". Dia mais recente primeiro, linha mais recente primeiro.
 */
export function groupByLocalDay(entries: MessageLogEntryDTO[], timezone: string): MessageLogDay[] {
  const byDay = new Map<string, MessageLogEntryDTO[]>();
  for (const entry of entries) {
    const key = localDayKey(entry.occurredAt, timezone);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(entry);
    else byDay.set(key, [entry]);
  }

  return [...byDay.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([dayKey, rows]) => {
      const sorted = [...rows].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
      return {
        dayKey,
        heading: formatLocalDayHeading(sorted[0].occurredAt, timezone),
        entries: sorted,
        totals: summarize(sorted),
      };
    });
}

const PERIOD_DAYS: Record<Exclude<PeriodKey, 'all'>, number> = { today: 1, '7d': 7, '30d': 30 };

/** Janela de dias locais terminando hoje, convertida para UTC. `all` não impõe limite. */
export function resolvePeriodBounds(
  period: PeriodKey,
  now: Date,
  timezone: string,
): { from: Date | undefined; to: Date | undefined } {
  if (period === 'all') return { from: undefined, to: undefined };

  const today = localDateOnly(now, timezone);
  const start = new Date(today.getTime() - (PERIOD_DAYS[period] - 1) * 24 * 60 * 60 * 1000);

  return {
    from: startOfLocalDay(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate(), timezone),
    to: endOfLocalDay(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), timezone),
  };
}

export function parsePeriod(value: string | undefined): PeriodKey {
  return PERIOD_OPTIONS.some((opt) => opt.value === value) ? (value as PeriodKey) : '7d';
}

export function parseStatus(value: string | undefined): StatusKey {
  return STATUS_OPTIONS.some((opt) => opt.value === value) ? (value as StatusKey) : 'all';
}
