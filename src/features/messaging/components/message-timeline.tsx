import { Inbox } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { formatLocalDate } from '@/lib/format';
import type { MessageDTO } from '../queries';

const STATUS_ICON: Record<string, string> = { SENT: '✓', FAILED: '✗', SKIPPED: '⊘', CANCELLED: '⊘', PENDING: '…' };

export function MessageTimeline({ messages, timezone }: { messages: MessageDTO[]; timezone: string }) {
  if (messages.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="Nenhuma mensagem enviada ainda"
        description="Mensagens manuais e da régua aparecem aqui."
      />
    );
  }

  return (
    <div className="space-y-2">
      {messages.map((msg) => (
        <div key={msg.id} className="rounded border border-border bg-surface p-3">
          <div className="flex items-center justify-between text-xs text-foreground-muted">
            <span>{STATUS_ICON[msg.status] ?? '?'} {formatLocalDate(msg.createdAt, timezone)}</span>
            <span>{msg.kind}</span>
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-foreground">{msg.body}</p>
          {msg.failReason && <p className="mt-1 text-xs text-danger">{msg.failReason}</p>}
        </div>
      ))}
    </div>
  );
}
