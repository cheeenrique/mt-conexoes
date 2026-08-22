'use client';

import { RefreshCw, Users } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

export default function CustomersError({ reset }: { error: Error; reset: () => void }) {
  return (
    <AppShell title="Clientes" icon={<Users size={22} />}>
      <EmptyState
        icon={Users}
        title="Não foi possível carregar os clientes"
        description="A lista não respondeu agora. A base continua intacta — nada foi perdido."
        action={
          <Button onClick={reset}>
            <RefreshCw aria-hidden="true" />
            Tentar de novo
          </Button>
        }
      />
    </AppShell>
  );
}
