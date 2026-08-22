import type { ReactNode } from 'react';
import { marginPercent } from '@/core/money';
import { formatCents, formatLocalDate } from '@/lib/format';
import { marginToneClass } from '@/lib/margin-tone';
import { CYCLE_LABELS, SUBSCRIPTION_STATUS_LABELS } from '@/lib/labels';
import { StatusBadge } from '@/components/ui/status-badge';
import type { FichaSubscriptionDTO } from '../../ficha-types';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-foreground-muted">{label}</dt>
      <dd className="font-mono text-sm tabular-mono text-foreground">{children}</dd>
    </div>
  );
}

export function FichaSubscription({
  subscription,
  timezone,
  action,
}: {
  subscription: FichaSubscriptionDTO | null;
  timezone: string;
  action?: ReactNode;
}) {
  if (!subscription) {
    return (
      <section className="rounded border border-border bg-surface p-4">
        <p className="text-xs font-bold uppercase tracking-[.08em] text-foreground-muted">Assinatura</p>
        <p className="mt-2 text-sm text-foreground-muted">
          Este cliente ainda não tem assinatura. Cadastre uma para o sistema gerar cobrança.
        </p>
        {action}
      </section>
    );
  }

  const margin = marginPercent(BigInt(subscription.priceCents), BigInt(subscription.costCents));

  return (
    <section className="flex flex-col gap-3.5 rounded border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-[.08em] text-foreground-muted">Assinatura</span>
        <div className="flex items-center gap-2">
          <StatusBadge tone={subscription.status === 'ACTIVE' ? 'success' : 'neutral'}>
            {SUBSCRIPTION_STATUS_LABELS[subscription.status] ?? subscription.status}
          </StatusBadge>
          {action}
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="Plano">{subscription.planName ?? 'Sem plano'}</Field>
        <Field label="Próximo vencimento">{formatLocalDate(subscription.nextDueAt, timezone)}</Field>
        <Field label="Telas">{subscription.screens}</Field>
        <Field label="Paga por ciclo">
          {formatCents(subscription.priceCents)}
          <span className="ml-1 text-xs text-foreground-muted">
            {CYCLE_LABELS[subscription.cycle] ?? subscription.cycle}
          </span>
        </Field>
        <Field label="Custo por ciclo">{formatCents(subscription.costCents)}</Field>
        <Field label="Margem">
          <span className={marginToneClass(margin)}>{margin === null ? '—' : `${margin.toFixed(0)}%`}</span>
        </Field>
      </dl>
    </section>
  );
}
