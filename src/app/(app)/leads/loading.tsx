import { Inbox } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Skeleton } from '@/components/ui/skeleton';

export default function LeadsLoading() {
  return (
    <AppShell title="Leads" icon={<Inbox size={22} />}>
      <div className="mb-4 flex flex-wrap gap-2.5">
        <Skeleton className="h-11 min-w-56 flex-1" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-24 md:h-10" />
        ))}
      </div>
      <div className="overflow-hidden rounded border border-border bg-surface">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="m-2 h-8" />
        ))}
      </div>
    </AppShell>
  );
}
