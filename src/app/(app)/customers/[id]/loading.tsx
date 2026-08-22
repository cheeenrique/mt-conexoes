import { Users } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Skeleton } from '@/components/ui/skeleton';

export default function CustomerProfileLoading() {
  return (
    <AppShell title="Cliente" icon={<Users size={22} />}>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-32" />
        <Skeleton className="h-40" />
        <Skeleton className="h-32" />
        <Skeleton className="h-40" />
      </div>
    </AppShell>
  );
}
