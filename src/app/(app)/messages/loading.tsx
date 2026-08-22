import { AppShell } from '@/components/layout/app-shell';
import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <AppShell title="Mensagens">
      <Skeleton className="mb-4 h-[62px] w-full" />
      {[0, 1].map((card) => (
        <div key={card} className="mb-4 overflow-hidden rounded border border-border bg-surface">
          <Skeleton className="h-11 w-full rounded-none" />
          {[0, 1, 2].map((row) => (
            <div key={row} className="border-t border-border px-4 py-2.5">
              <Skeleton className="h-5 w-full" />
            </div>
          ))}
        </div>
      ))}
    </AppShell>
  );
}
