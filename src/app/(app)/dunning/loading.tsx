import { GitCommitHorizontal } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <AppShell title="Réguas" icon={<GitCommitHorizontal size={22} />}>
      <div className="grid items-start gap-4 md:grid-cols-[minmax(220px,280px)_1fr]">
        <div className="flex flex-col gap-2.5">
          {[0, 1, 2].map((card) => (
            <Skeleton key={card} className="h-[74px] w-full" />
          ))}
        </div>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-[88px] w-full" />
          <Skeleton className="h-[132px] w-full" />
          <Skeleton className="h-[220px] w-full" />
        </div>
      </div>
    </AppShell>
  );
}
