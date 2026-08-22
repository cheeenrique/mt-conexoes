'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MessageSquareText } from 'lucide-react';
import { StatusBadge } from '@/components/ui/status-badge';
import { MessageDetailDrawer } from './message-detail-drawer';
import {
  formatLocalTime,
  outcomeBadge,
  reasonText,
  type MessageLogDay,
  type MessageLogEntryDTO,
  type MessageLogTotals,
} from '../message-log-format';

const ORIGIN_LABEL = { RULE: 'Régua', MANUAL: 'Manual' } as const;

function dayLine(totals: MessageLogTotals): string {
  const parts: string[] = [];
  if (totals.sent) parts.push(`${totals.sent} enviada${totals.sent > 1 ? 's' : ''}`);
  if (totals.pending) parts.push(`${totals.pending} na fila`);
  if (totals.skipped) parts.push(`${totals.skipped} pulada${totals.skipped > 1 ? 's' : ''}`);
  if (totals.failed) parts.push(`${totals.failed} falha${totals.failed > 1 ? 's' : ''}`);
  return parts.join(' · ');
}

function MessageRow({
  entry,
  timezone,
  onOpen,
}: {
  entry: MessageLogEntryDTO;
  timezone: string;
  onOpen: () => void;
}) {
  const badge = outcomeBadge(entry);
  const reason = reasonText(entry);
  const detail = [entry.stepLabel, reason].filter(Boolean).join(' · ');

  return (
    <div className="flex min-h-11 flex-wrap items-center gap-3 border-b border-border px-4 py-2.5 last:border-0">
      <span className="w-11 shrink-0 font-mono tabular-mono text-[13px] text-foreground-muted">
        {formatLocalTime(entry.occurredAt, timezone)}
      </span>
      <Link
        href={`/customers/${entry.customerId}`}
        className="min-w-[140px] text-sm font-semibold text-foreground hover:underline"
      >
        {entry.customerName}
      </Link>
      <span className="min-w-[160px] flex-1 text-[13px] text-foreground-muted">{detail || '—'}</span>
      <span className="rounded-badge border border-border px-2 py-0.5 text-[11px] font-semibold text-foreground-muted">
        {ORIGIN_LABEL[entry.origin]}
      </span>
      <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Ver o texto da mensagem de ${entry.customerName}`}
        title="Ver o texto"
        className="flex size-11 shrink-0 items-center justify-center rounded-badge border border-border text-foreground-muted transition-colors hover:text-foreground md:size-8"
      >
        <MessageSquareText size={15} />
      </button>
    </div>
  );
}

export function MessageLogDays({ days, timezone }: { days: MessageLogDay[]; timezone: string }) {
  // Estado de UI puro: qual linha está aberta. Um único diálogo para a lista inteira.
  const [selected, setSelected] = useState<MessageLogEntryDTO | null>(null);

  return (
    <div className="flex flex-col gap-4">
      {days.map((day) => (
        <section key={day.dayKey} className="overflow-hidden rounded border border-border bg-surface">
          <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <h2 className="text-[13px] font-bold tracking-[.06em] text-foreground-muted uppercase">{day.heading}</h2>
            <span className="font-mono tabular-mono text-xs text-foreground-muted">{dayLine(day.totals)}</span>
          </header>
          {day.entries.map((entry) => (
            <MessageRow
              key={`${entry.source}:${entry.id}`}
              entry={entry}
              timezone={timezone}
              onOpen={() => setSelected(entry)}
            />
          ))}
        </section>
      ))}

      <MessageDetailDrawer entry={selected} timezone={timezone} onClose={() => setSelected(null)} />
    </div>
  );
}
