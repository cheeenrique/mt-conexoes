import { Receipt } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { formatCents, formatLocalDate } from '@/lib/format';
import { ChargeStatusBadge } from './charge-status-badge';
import type { ChargeDTO } from '../queries';

export function CustomerChargeHistory({ charges, timezone }: { charges: ChargeDTO[]; timezone: string }) {
  if (charges.length === 0) {
    return (
      <EmptyState
        icon={Receipt}
        title="Nenhuma cobrança ainda"
        description="A primeira cobrança nasce junto com a assinatura ativa."
      />
    );
  }

  return (
    <div className="space-y-3">
      {charges.map((charge) => (
        <div key={charge.id} className="rounded border border-border bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm tabular-mono">{formatCents(charge.netCents)}</span>
              <span className="text-xs text-foreground-muted">
                venc. {formatLocalDate(charge.dueAt, timezone)}
              </span>
              <ChargeStatusBadge status={charge.status} />
            </div>
            <span className="text-xs text-foreground-muted">
              pago {formatCents(charge.paidCents)}
            </span>
          </div>
          {charge.payments.length > 0 && (
            <ul className="mt-3 space-y-1 border-t border-border pt-3">
              {charge.payments.map((payment) => (
                <li key={payment.id} className="flex justify-between text-xs text-foreground-muted">
                  <span>{formatLocalDate(payment.paidAt, timezone)} · {payment.method}</span>
                  <span className="font-mono tabular-mono">{formatCents(payment.amountCents)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
