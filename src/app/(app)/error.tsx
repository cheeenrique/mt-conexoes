'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

/**
 * Fronteira de erro do grupo `(app)`. Genérica de propósito: vale para
 * qualquer tela do painel sem `error.tsx` próprio. Não mostra `error.message`
 * — stack, SQL e nome de tabela não vazam para a tela (regra 02-servidor).
 */
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <AppShell title="">
      <EmptyState
        icon={AlertTriangle}
        title="Não foi possível carregar esta tela"
        description="Os dados não vieram do servidor. Nada foi alterado — tente de novo em alguns instantes."
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
