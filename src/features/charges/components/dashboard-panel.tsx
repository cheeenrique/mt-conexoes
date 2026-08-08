import Link from 'next/link';
import { CalendarClock, CalendarRange, AlertTriangle, Wallet } from 'lucide-react';
import { formatCents, formatLocalDate } from '@/lib/format';
import { ChargeStatusBadge } from './charge-status-badge';
import type { ChargeDTO } from '../queries';

function outstandingCents(rows: ChargeDTO[]): bigint {
  return rows.reduce((sum, row) => sum + (BigInt(row.netCents) - BigInt(row.paidCents)), 0n);
}

function chargeCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'cobrança' : 'cobranças'}`;
}

function SummaryCard({
  icon: Icon,
  label,
  subtitle,
  amountCents,
  href,
}: {
  icon: typeof CalendarClock;
  label: string;
  subtitle: string;
  amountCents: bigint;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="rounded border border-border bg-surface p-5 transition-colors hover:border-border-strong"
    >
      <div className="mb-3 flex items-center gap-2 text-foreground-muted">
        <Icon size={16} />
        <p className="text-xs font-semibold uppercase tracking-wide">{label}</p>
      </div>
      <p className="font-mono text-2xl font-bold tabular-mono text-foreground">{formatCents(amountCents)}</p>
      <p className="mt-1 text-sm text-foreground-muted">{subtitle}</p>
    </Link>
  );
}

function ChargePreviewList({ title, rows, timezone }: { title: string; rows: ChargeDTO[]; timezone: string }) {
  const preview = rows.slice(0, 5);
  return (
    <div className="rounded border border-border bg-surface p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-foreground-muted">{title}</p>
      {preview.length === 0 ? (
        <p className="py-2 text-sm text-foreground-muted">Nenhuma cobrança.</p>
      ) : (
        <ul>
          {preview.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-3 border-b border-border py-2 last:border-0">
              <Link href={`/customers/${row.customerId}`} className="text-sm font-semibold text-foreground hover:text-brand">
                {row.customerName}
              </Link>
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm tabular-mono text-foreground-muted">
                  {formatLocalDate(row.dueAt, timezone)}
                </span>
                <span className="font-mono text-sm tabular-mono text-foreground">{formatCents(row.netCents)}</span>
                <ChargeStatusBadge status={row.status} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function DashboardPanel({
  summary,
  timezone,
}: {
  summary: {
    dueToday: ChargeDTO[];
    dueNext7Days: ChargeDTO[];
    overdue: ChargeDTO[];
    receivedThisMonthCents: string;
  };
  timezone: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          icon={CalendarClock}
          label="Vencem hoje"
          subtitle={chargeCountLabel(summary.dueToday.length)}
          amountCents={outstandingCents(summary.dueToday)}
          href="/charges?status=OPEN"
        />
        <SummaryCard
          icon={CalendarRange}
          label="Próximos 7 dias"
          subtitle={chargeCountLabel(summary.dueNext7Days.length)}
          amountCents={outstandingCents(summary.dueNext7Days)}
          href="/charges?status=OPEN"
        />
        <SummaryCard
          icon={AlertTriangle}
          label="Em atraso"
          subtitle={chargeCountLabel(summary.overdue.length)}
          amountCents={outstandingCents(summary.overdue)}
          href="/charges?status=OVERDUE"
        />
        <SummaryCard
          icon={Wallet}
          label="Recebido no mês"
          subtitle="Total de pagamentos"
          amountCents={BigInt(summary.receivedThisMonthCents)}
          href="/charges?status=PAID"
        />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChargePreviewList title="Vencem hoje" rows={summary.dueToday} timezone={timezone} />
        <ChargePreviewList title="Próximos 7 dias" rows={summary.dueNext7Days} timezone={timezone} />
        <ChargePreviewList title="Em atraso" rows={summary.overdue} timezone={timezone} />
      </div>
    </div>
  );
}
