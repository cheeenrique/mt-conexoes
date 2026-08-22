'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { PERIOD_OPTIONS, STATUS_OPTIONS, type MessageLogTotals } from '../message-log-format';

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** "18 mensagens · 14 enviadas · 3 puladas · 1 falha" — conta o período inteiro,
 *  de propósito ignorando o filtro de situação: é o que mostra o que está sendo escondido. */
function summaryLine(totals: MessageLogTotals): string {
  const parts = [plural(totals.total, 'mensagem', 'mensagens')];
  if (totals.sent) parts.push(plural(totals.sent, 'enviada', 'enviadas'));
  if (totals.pending) parts.push(plural(totals.pending, 'na fila', 'na fila'));
  if (totals.skipped) parts.push(plural(totals.skipped, 'pulada', 'puladas'));
  if (totals.failed) parts.push(plural(totals.failed, 'falha', 'falhas'));
  return parts.join(' · ');
}

export function MessageLogFilters({
  period,
  status,
  totals,
}: {
  period: string;
  status: string;
  totals: MessageLogTotals;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Filtro mora na URL: o operador compartilha o link e volta pelo histórico.
  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams);
    params.set(key, value);
    router.push(`/messages?${params.toString()}`);
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-3 rounded border border-border bg-surface px-4 py-3">
      <div className="flex items-center gap-2.5">
        <span className="text-[11px] font-bold tracking-[.08em] text-foreground-muted uppercase">Período</span>
        <div className="flex" role="group" aria-label="Período">
          {PERIOD_OPTIONS.map((opt, index) => (
            <button
              key={opt.value}
              type="button"
              aria-pressed={period === opt.value}
              onClick={() => setParam('period', opt.value)}
              className={`h-11 border border-border px-3 text-sm md:h-8 ${index === 0 ? 'rounded-l-badge' : '-ml-px'} ${
                index === PERIOD_OPTIONS.length - 1 ? 'rounded-r-badge' : ''
              } ${
                period === opt.value
                  ? 'z-10 bg-surface-elevated font-semibold text-foreground'
                  : 'text-foreground-muted hover:text-foreground'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <span className="text-[11px] font-bold tracking-[.08em] text-foreground-muted uppercase">Situação</span>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Situação">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              aria-pressed={status === opt.value}
              onClick={() => setParam('status', opt.value)}
              className={`h-11 rounded-badge border px-3 text-sm md:h-8 ${
                status === opt.value
                  ? 'border-border-strong bg-surface-elevated font-semibold text-foreground'
                  : 'border-border text-foreground-muted hover:text-foreground'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <p className="ml-auto font-mono tabular-mono text-xs text-foreground-muted">{summaryLine(totals)}</p>
    </div>
  );
}
