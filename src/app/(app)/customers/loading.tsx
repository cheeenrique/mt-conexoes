import { Users } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Skeleton } from '@/components/ui/skeleton';

export default function CustomersLoading() {
  return (
    <AppShell title="Clientes" icon={<Users size={22} />}>
      <div className="mb-4 flex flex-wrap gap-2.5">
        <Skeleton className="h-10 min-w-56 flex-1" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-24" />
        ))}
      </div>
      <div className="overflow-hidden rounded border border-border bg-surface">
        {/* Seis linhas com a altura real da tabela — o esqueleto não pode
            deslocar a lista quando os dados chegarem. */}
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="m-2 h-8" />
        ))}
      </div>
    </AppShell>
  );
}
