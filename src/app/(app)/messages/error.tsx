'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <AppShell title="Mensagens">
      <EmptyState
        icon={AlertTriangle}
        title="Não foi possível carregar as mensagens"
        description="A lista não veio do servidor. Tente de novo em alguns instantes."
        action={
          <Button type="button" onClick={reset}>
            <RefreshCw aria-hidden="true" />
            Tentar de novo
          </Button>
        }
      />
    </AppShell>
  );
}
