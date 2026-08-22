import { formatLocalDate, formatLocalTime } from '@/lib/format';
import type { FichaMessageDTO } from '../../ficha-types';

// Marca por estado (handoff 04 §Mensagens). Estado desconhecido aparece cru:
// inventar rótulo para o que o job não gravou é como o operador perde a
// confiança na tela inteira.
const MARK: Record<string, { glyph: string; className: string }> = {
  SENT: { glyph: '✓', className: 'text-success' },
  PENDING: { glyph: '…', className: 'text-foreground-muted' },
  SKIPPED: { glyph: '⊘', className: 'text-foreground-muted' },
  CANCELLED: { glyph: '⊘', className: 'text-foreground-muted' },
  RECEIVED: { glyph: '↩', className: 'text-foreground-muted' },
  FAILED: { glyph: '✕', className: 'text-danger' },
};

const CANCEL_REASON_LABEL: Record<string, string> = {
  stale: 'mensagem parada há mais de 24h',
  opted_out: 'cliente pediu pra sair',
  charge_closed: 'cobrança já paga ou cancelada',
};

export function FichaMessages({ messages, timezone }: { messages: FichaMessageDTO[]; timezone: string }) {
  return (
    <section className="rounded border border-border bg-surface p-4">
      <p className="mb-2 text-xs font-bold uppercase tracking-[.08em] text-foreground-muted">Mensagens</p>
      {messages.length === 0 ? (
        <p className="text-sm text-foreground-muted">Nenhuma mensagem enviada ainda.</p>
      ) : (
        <ul>
          {messages.map((message) => {
            const mark = MARK[message.status];
            const reason =
              message.failReason ??
              (message.cancelReason
                ? `Cancelada: ${CANCEL_REASON_LABEL[message.cancelReason] ?? message.cancelReason}`
                : null);
            return (
              <li key={message.id} className="flex items-center gap-3 border-b border-border py-2.5 last:border-0">
                <span className={`w-4 shrink-0 text-center ${mark?.className ?? 'text-foreground-muted'}`}>
                  {mark?.glyph ?? message.status}
                </span>
                <span className="w-[74px] shrink-0 font-mono text-xs tabular-mono text-foreground-muted">
                  {formatLocalDate(message.at, timezone)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-foreground">{message.body}</span>
                  {reason && <span className="block truncate text-xs text-danger">{reason}</span>}
                </span>
                <span className="shrink-0 font-mono text-xs tabular-mono text-foreground-muted">
                  {formatLocalTime(message.at, timezone)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
