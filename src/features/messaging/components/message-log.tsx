import { Inbox, Pause } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { MessageLogFilters } from './message-log-filters';
import { MessageLogDays } from './message-log-days';
import {
  filterByStatus,
  groupByLocalDay,
  summarize,
  type MessageLogEntryDTO,
  type PeriodKey,
  type StatusKey,
} from '../message-log-format';

const PERIOD_HINT: Record<PeriodKey, string> = {
  today: 'Amplie o período para 7 ou 30 dias.',
  '7d': 'Amplie o período para 30 dias ou para tudo.',
  '30d': 'Amplie o período para tudo.',
  all: 'Nenhuma mensagem foi criada até agora.',
};

export function MessageLog({
  entries,
  truncated,
  period,
  status,
  ruleStatus,
  timezone,
}: {
  entries: MessageLogEntryDTO[];
  truncated: boolean;
  period: PeriodKey;
  status: StatusKey;
  ruleStatus: string;
  timezone: string;
}) {
  // O resumo conta o período inteiro; a lista respeita também o filtro de situação.
  const totals = summarize(entries);
  const visible = filterByStatus(entries, status);
  const days = groupByLocalDay(visible, timezone);

  return (
    <>
      {ruleStatus === 'REVIEW' && (
        <div className="mb-4 flex items-center gap-2 rounded border border-warning/40 bg-warning/[.14] px-4 py-3 text-sm font-semibold text-warning">
          <Pause size={16} />
          A régua está em revisão. Nada sai enquanto isso.
        </div>
      )}

      <MessageLogFilters period={period} status={status} totals={totals} />

      {days.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={status === 'all' ? 'Sem mensagem no período' : 'Sem mensagem nessa situação'}
          description={
            status === 'all' ? PERIOD_HINT[period] : 'Troque a situação para "Todas" ou amplie o período.'
          }
        />
      ) : (
        <MessageLogDays days={days} timezone={timezone} />
      )}

      {truncated && (
        <p className="mt-4 text-[13px] text-foreground-muted">
          A lista mostra as mais recentes do período. Reduza o período para ver o restante.
        </p>
      )}

      <p className="mt-4 text-[13px] text-foreground-muted">
        Um cliente recebe no máximo uma mensagem de cobrança por dia, mesmo com três cobranças vencidas.
      </p>
    </>
  );
}
