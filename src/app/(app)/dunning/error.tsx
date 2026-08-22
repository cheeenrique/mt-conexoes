'use client';

import { AlertTriangle, GitCommitHorizontal, RefreshCw } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

/**
 * Sem este boundary, um banco sem régua padrão (`NoDefaultDunningRuleError`,
 * lançado em `features/dunning/queries.ts`) derrubava a rota inteira e o
 * operador via tela branca, sem caminho de volta.
 *
 * O `error` não vai para a tela: mensagem de erro de domínio o usuário lê no
 * toast da ação, e stack trace nunca vaza para a interface.
 */
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <AppShell title="Réguas" icon={<GitCommitHorizontal size={22} />}>
      <EmptyState
        icon={AlertTriangle}
        title="Não foi possível carregar as réguas"
        description="A régua de cobrança não veio do servidor. Tente de novo; se continuar, confira se existe uma régua marcada como padrão."
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
