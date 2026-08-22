'use client';

import { createContext, useContext, useOptimistic, useTransition, type ReactNode } from 'react';
import { toggleSendingPausedAction } from '../actions';
import { toastError } from '@/lib/toast';

// Kill switch (T8, CLAUDE.md §Régua — travas). `Settings.sendingPaused` nasce
// no servidor em `(app)/layout.tsx` (única leitura por navegação) e desce por
// aqui — a sidebar e a faixa de pausa aparecem em toda tela, renderizadas por
// cada `page.tsx` dentro de `<AppShell>`, então o valor não chega até elas
// por prop direta. Context é o caminho, não `useState` copiado do servidor
// (proibido por .claude/rules/04-frontend.md).
type SendingPausedContextValue = {
  paused: boolean;
  togglePause: () => void;
  pending: boolean;
};

const SendingPausedContext = createContext<SendingPausedContextValue | null>(null);

export function SendingPausedProvider({
  initialPaused,
  children,
}: {
  initialPaused: boolean;
  children: ReactNode;
}) {
  const [optimisticPaused, setOptimisticPaused] = useOptimistic(initialPaused);
  const [pending, startTransition] = useTransition();

  function togglePause() {
    const next = !optimisticPaused;
    startTransition(async () => {
      setOptimisticPaused(next);
      const result = await toggleSendingPausedAction(next);
      // Sucesso: `revalidatePath` na action busca `initialPaused` fresco do
      // servidor, e o optimistic passa a bater com ele — sem flash de volta.
      // Erro: nada revalida `initialPaused`, então ao fim da transition o
      // optimistic reverte sozinho para o valor real. O toast só existe pra
      // o operador não ficar sem saber por quê a faixa não mudou.
      if ('error' in result) toastError(result.error);
    });
  }

  return (
    <SendingPausedContext.Provider value={{ paused: optimisticPaused, togglePause, pending }}>
      {children}
    </SendingPausedContext.Provider>
  );
}

export function useSendingPaused(): SendingPausedContextValue {
  const ctx = useContext(SendingPausedContext);
  if (!ctx) throw new Error('useSendingPaused precisa estar dentro de SendingPausedProvider.');
  return ctx;
}
