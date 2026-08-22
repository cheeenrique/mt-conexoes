import { formatCents, formatLocalDate } from '@/lib/format';
import { CHARGE_STATUS_LABELS, PAYMENT_METHOD_LABELS } from '@/lib/labels';
import { StatusBadge } from '@/components/ui/status-badge';
import type { FichaPaymentDTO } from '../../ficha-types';

const CHARGE_TONE: Record<string, 'success' | 'warning' | 'brand' | 'neutral'> = {
  PAID: 'success',
  OVERDUE: 'brand',
  PARTIALLY_PAID: 'warning',
  OPEN: 'neutral',
  CANCELLED: 'neutral',
};

export function FichaPayments({ payments, timezone }: { payments: FichaPaymentDTO[]; timezone: string }) {
  return (
    <section className="rounded border border-border bg-surface p-4">
      <p className="mb-2 text-xs font-bold uppercase tracking-[.08em] text-foreground-muted">
        Histórico de pagamentos
      </p>
      {payments.length === 0 ? (
        <p className="text-sm text-foreground-muted">Nenhum pagamento registrado ainda.</p>
      ) : (
        <ul>
          {payments.map((payment) => (
            <li
              key={payment.id}
              className="flex h-11 items-center gap-3 border-b border-border text-sm last:border-0"
            >
              <span className="w-[74px] shrink-0 font-mono text-xs tabular-mono text-foreground-muted">
                {formatLocalDate(payment.paidAt, timezone)}
              </span>
              <StatusBadge tone={CHARGE_TONE[payment.chargeStatus] ?? 'neutral'}>
                {CHARGE_STATUS_LABELS[payment.chargeStatus] ?? payment.chargeStatus}
              </StatusBadge>
              <span className="flex-1 truncate text-foreground-muted">
                {PAYMENT_METHOD_LABELS[payment.method] ?? payment.method}
              </span>
              <span className="font-mono tabular-mono text-foreground">{formatCents(payment.amountCents)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
