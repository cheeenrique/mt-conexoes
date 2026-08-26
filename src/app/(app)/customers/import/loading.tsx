import { Upload } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Skeleton } from '@/components/ui/skeleton';

export default function ImportCustomersLoading() {
  return (
    <AppShell title="Importar planilha" icon={<Upload size={22} />}>
      <div className="flex max-w-lg flex-col gap-4">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
    </AppShell>
  );
}
