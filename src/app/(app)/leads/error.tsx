'use client';

import { Inbox, RefreshCw } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

export default function LeadsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <AppShell title="Leads" icon={<Inbox size={22} />}>
      <EmptyState
        icon={Inbox}
        title="Não foi possível carregar os leads"
        description="A lista não respondeu agora. Os leads continuam guardados — nada foi perdido."
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
