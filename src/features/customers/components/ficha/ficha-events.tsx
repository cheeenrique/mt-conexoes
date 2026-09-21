import { formatLocalDate } from '@/lib/format';
import { FINANCIAL_EVENT_LABELS } from '@/lib/labels';
import type { FichaEventDTO } from '../../ficha-types';

/**
 * "O que mudou nesta assinatura" — a linha do tempo que responde por que o
 * cliente está no preço em que está. Lê `summary` pronto do servidor: o
 * payload de cada `kind` tem forma própria, e traduzir isso na tela espalharia
 * o conhecimento do log por dois lugares.
 */
export function FichaEvents({ events, timezone }: { events: FichaEventDTO[]; timezone: string }) {
  return (
    <section className="rounded border border-border bg-surface p-4">
      <p className="mb-2 text-xs font-bold uppercase tracking-[.08em] text-foreground-muted">Alterações</p>
      {events.length === 0 ? (
        <p className="text-sm text-foreground-muted">Nada mudou nesta assinatura ainda.</p>
      ) : (
        <ul>
          {events.map((event) => (
            <li key={event.id} className="flex flex-col gap-0.5 border-b border-border py-2 text-sm last:border-0">
              <div className="flex items-baseline gap-3">
                <span className="w-[74px] shrink-0 font-mono text-xs tabular-mono text-foreground-muted">
                  {formatLocalDate(event.at, timezone)}
                </span>
                <span className="text-foreground">{FINANCIAL_EVENT_LABELS[event.kind] ?? event.kind}</span>
                <span className="flex-1 truncate font-mono tabular-mono text-foreground-muted">{event.summary}</span>
              </div>
              {event.reason && <p className="pl-[86px] text-xs text-foreground-muted">{event.reason}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
