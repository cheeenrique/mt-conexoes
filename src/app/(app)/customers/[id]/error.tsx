'use client';

import { RefreshCw, Users } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

export default function CustomerProfileError({ reset }: { error: Error; reset: () => void }) {
  return (
    <AppShell title="Cliente" icon={<Users size={22} />}>
      <EmptyState
        icon={Users}
        title="Não foi possível carregar a ficha"
        description="Os dados deste cliente não responderam agora. Nada foi alterado."
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
