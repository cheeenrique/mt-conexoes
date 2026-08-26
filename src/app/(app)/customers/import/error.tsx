'use client';

import { RefreshCw, Upload } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

export default function ImportCustomersError({ reset }: { error: Error; reset: () => void }) {
  return (
    <AppShell title="Importar planilha" icon={<Upload size={22} />}>
      <EmptyState
        icon={Upload}
        title="Não foi possível abrir a importação"
        description="A tela não respondeu agora. Nada foi lido nem gravado — tente de novo."
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
