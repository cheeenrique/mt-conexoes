import Link from 'next/link';
import { CalendarClock } from 'lucide-react';
import { formatCents } from '@/lib/format';
import type { DueDateOverview } from '../queries';
import type { DueDateBucket } from '@/core/due-date-buckets';

/**
 * Ordem de exibição do handoff (`telas/02-inicio.md` §3): o atraso fica à
 * esquerda e o futuro à direita, o oposto de `DUE_DATE_BUCKETS`. Só a ordem
 * de renderização muda — a semântica dos baldes em `core/` continua a mesma
 * (`D+n` = n dias vencida, `D-n` = n dias a vencer), igual ao protótipo.
 */
const DISPLAY_ORDER: readonly DueDateBucket[] = ['D+5', 'D+3', 'D+1', 'D0', 'D-2', 'D-5'];

type Zone = 'overdue' | 'today' | 'upcoming';

const ZONE_OF: Record<DueDateBucket, Zone> = {
  'D+5': 'overdue',
  'D+3': 'overdue',
  'D+1': 'overdue',
  D0: 'today',
  'D-2': 'upcoming',
  'D-5': 'upcoming',
};

const ZONE_TEXT: Record<Zone, string> = {
  overdue: 'text-brand-light',
  today: 'text-warning',
  upcoming: 'text-foreground-muted',
};

const ZONE_BAR: Record<Zone, string> = {
  overdue: 'bg-brand-light',
  today: 'bg-warning',
  upcoming: 'bg-foreground-muted',
};

const BAR_BOX_HEIGHT = 56;
const BAR_MIN_HEIGHT = 6;

function barHeight(count: number, maxCount: number): number {
  if (maxCount === 0) return BAR_MIN_HEIGHT;
  return Math.max(BAR_MIN_HEIGHT, Math.round((BAR_BOX_HEIGHT * count) / maxCount));
}

export function DueDateStrip({
  buckets,
  selected,
  todayLabel,
}: {
  buckets: DueDateOverview['buckets'];
  /** `null` = sem filtro, a lista mostra tudo que está em aberto. */
  selected: DueDateBucket | null;
  todayLabel: string;
}) {
  const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));
  const columns = DISPLAY_ORDER.map((key) => byKey.get(key)).filter((bucket) => bucket !== undefined);
  const maxCount = Math.max(0, ...columns.map((bucket) => bucket.count));

  return (
    <section className="overflow-hidden rounded border border-border bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <span className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[.06em] text-foreground-muted">
          <CalendarClock size={15} aria-hidden className="shrink-0 text-brand-light" />
          Vencimentos · onde o dinheiro está
        </span>
        <span className="font-mono text-xs tabular-mono text-foreground-muted">{todayLabel}</span>
      </div>

      <p className="px-4 pt-3 text-[13px] text-foreground-muted">
        A régua cobra sozinha. Esta faixa é para dar baixa e ver onde o dinheiro está parado. Clique numa coluna para
        filtrar a lista.
      </p>

      <div className="overflow-x-auto px-2 pb-3">
        <div className="min-w-[560px]">
          <div className="flex px-2 pb-1 pt-3.5 text-[11px] font-bold uppercase tracking-[.1em]">
            <span className="flex-[3] text-brand-light">Atraso</span>
            <span className="flex-1 text-center text-warning">Hoje</span>
            <span className="flex-[2] text-right text-foreground-muted">A vencer</span>
          </div>

          <div className="flex items-end">
            {columns.map((bucket) => {
              const zone = ZONE_OF[bucket.key];
              const isSelected = bucket.key === selected;
              return (
                <Link
                  key={bucket.key}
                  href={isSelected ? '?' : `?bucket=${encodeURIComponent(bucket.key)}`}
                  aria-label={
                    isSelected
                      ? `${bucket.label}: limpar filtro da lista`
                      : `${bucket.label}: filtrar a lista por este vencimento`
                  }
                  aria-current={isSelected ? 'true' : undefined}
                  className={`flex flex-1 flex-col items-center gap-1.5 rounded-badge px-2 py-2 transition-colors ${
                    isSelected ? 'bg-surface-elevated' : 'hover:bg-surface-elevated/50'
                  }`}
                >
                  <span className={`font-mono text-[19px] font-semibold leading-none tabular-mono ${ZONE_TEXT[zone]}`}>
                    {bucket.count}
                  </span>
                  <span className="flex w-full items-end" style={{ height: BAR_BOX_HEIGHT }}>
                    <span
                      aria-hidden
                      className={`w-full rounded-badge ${ZONE_BAR[zone]}`}
                      style={{ height: barHeight(bucket.count, maxCount) }}
                    />
                  </span>
                  <span className={`text-[11px] font-bold uppercase tracking-[.08em] ${ZONE_TEXT[zone]}`}>
                    {bucket.label}
                  </span>
                  <span className="font-mono text-xs tabular-mono text-foreground-muted">
                    {formatCents(bucket.amountCents)}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
