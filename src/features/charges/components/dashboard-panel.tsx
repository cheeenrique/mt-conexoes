import Link from 'next/link';
import { formatCents, formatLocalDate } from '@/lib/format';
import { ChargeStatusBadge } from './charge-status-badge';
import { DueDateStrip } from './due-date-strip';
import type { ChargeDTO, DueDateOverview } from '../queries';
import type { DueDateBucket } from '@/core/due-date-buckets';

const PREVIEW_CAP = 20;
const OVERDUE_BUCKETS = new Set<DueDateBucket>(['D+1', 'D+3', 'D+5']);

function ChargeFilteredList({
  bucketLabel,
  rows,
  timezone,
  seeMoreHref,
}: {
  bucketLabel: string;
  rows: (ChargeDTO & { bucket: DueDateBucket })[];
  timezone: string;
  seeMoreHref: string;
}) {
  const preview = rows.slice(0, PREVIEW_CAP);
  return (
    <div className="rounded border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">{bucketLabel}</p>
        {rows.length > PREVIEW_CAP && (
          <p className="text-xs text-foreground-muted">
            mostrando {PREVIEW_CAP} de {rows.length} —{' '}
            <Link href={seeMoreHref} className="text-brand hover:underline">
              ver todas
            </Link>
          </p>
        )}
      </div>
      {preview.length === 0 ? (
        <p className="py-2 text-sm text-foreground-muted">Nenhuma cobrança neste balde.</p>
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
                <span className="font-mono text-sm tabular-mono text-foreground">
                  {formatCents(BigInt(row.netCents) - BigInt(row.paidCents))}
                </span>
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
  overview,
  selectedBucket,
  timezone,
}: {
  overview: DueDateOverview;
  selectedBucket: DueDateBucket;
  timezone: string;
}) {
  const selected = overview.buckets.find((b) => b.key === selectedBucket)!;
  const filteredCharges = overview.charges.filter((c) => c.bucket === selectedBucket);
  const seeMoreStatus = OVERDUE_BUCKETS.has(selectedBucket) ? 'OVERDUE' : 'OPEN';

  return (
    <div className="flex flex-col gap-6">
      <DueDateStrip buckets={overview.buckets} selected={selectedBucket} />
      <ChargeFilteredList
        bucketLabel={selected.label}
        rows={filteredCharges}
        timezone={timezone}
        seeMoreHref={`/charges?status=${seeMoreStatus}`}
      />
      <div className="rounded border border-border bg-surface p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Recebido no mês</p>
        <p className="mt-1 font-mono text-xl font-bold tabular-mono text-foreground">
          {formatCents(BigInt(overview.receivedThisMonthCents))}
        </p>
      </div>
    </div>
  );
}
