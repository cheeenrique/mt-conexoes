import Link from 'next/link';
import { formatCents } from '@/lib/format';
import type { DueDateOverview } from '../queries';
import type { DueDateBucket } from '@/core/due-date-buckets';

const ZONE_STYLE: Record<DueDateBucket, string> = {
  'D-5': 'text-foreground-muted',
  'D-2': 'text-foreground-muted',
  D0: 'text-warning',
  'D+1': 'text-danger',
  'D+3': 'text-danger',
  'D+5': 'text-danger',
};

export function DueDateStrip({
  buckets,
  selected,
}: {
  buckets: DueDateOverview['buckets'];
  selected: DueDateBucket;
}) {
  return (
    <div className="mb-4 overflow-x-auto rounded border border-border bg-surface">
      <div className="flex min-w-max">
        {buckets.map((bucket) => {
          const isSelected = bucket.key === selected;
          return (
            <Link
              key={bucket.key}
              href={`?bucket=${encodeURIComponent(bucket.key)}`}
              aria-current={isSelected ? 'true' : undefined}
              className={`flex min-w-[120px] flex-1 flex-col gap-1 border-r border-b-2 border-border p-4 last:border-r-0 ${
                isSelected ? 'border-b-brand bg-surface-elevated' : 'border-b-transparent hover:bg-surface-elevated/50'
              }`}
            >
              <span className={`text-xs font-semibold uppercase tracking-wide ${ZONE_STYLE[bucket.key]}`}>
                {bucket.label}
              </span>
              <span className="font-mono text-lg font-bold tabular-mono text-foreground">{bucket.count}</span>
              <span className="font-mono text-xs tabular-mono text-foreground-muted">
                {formatCents(BigInt(bucket.amountCents))}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
