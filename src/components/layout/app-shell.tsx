'use client';

import { useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from './sidebar';
import { Header } from './header';
import { PauseBanner } from './pause-banner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useSendingPaused } from '@/features/settings/components/sending-paused-provider';

export function AppShell({
  title,
  icon,
  primaryAction,
  children,
}: {
  title: string;
  /** Ícone já renderizado (`<Users size={22} />`) — ver `Header`. */
  icon?: ReactNode;
  primaryAction?: ReactNode;
  children: ReactNode;
}) {
  // Kill switch (T8): vem do banco via SendingPausedProvider, montado em
  // `(app)/layout.tsx`. Nunca copiar pra `useState` — derivar direto do hook.
  const { paused, togglePause } = useSendingPaused();

  // Gaveta da sidebar abaixo de 900px (README §Responsivo). Estado de UI
  // local — nunca precisa sobreviver à navegação ou ao reload.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Chave da animação de entrada do conteúdo. Só o caminho, nunca os
  // `searchParams`: filtrar a lista de cobranças ou abrir a gaveta do cliente
  // por `?cliente=` mudam a busca, não a rota, e reanimar a tela inteira a cada
  // filtro digitado seria pior que não animar.
  const pathname = usePathname();

  return (
    // Provider único: dá o delay em grupo (README/tooltip §mecanismo de
    // grupo) a todo botão-ícone da tela — nunca um por tooltip individual.
    <TooltipProvider>
      <div className="flex">
        <Sidebar
          paused={paused}
          onTogglePause={togglePause}
          mobileOpen={mobileNavOpen}
          onMobileOpenChange={setMobileNavOpen}
        />
        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          {/* Topo fixo: o operador precisa do título da tela e da ação primária
              sempre à mão em listas longas de cobrança. */}
          <div className="sticky top-0 z-30 bg-background">
            <PauseBanner paused={paused} />
            <Header
              title={title}
              icon={icon}
              primaryAction={primaryAction}
              onOpenMenu={() => setMobileNavOpen(true)}
            />
          </div>
          <main className="flex-1" style={{ padding: 'clamp(16px, 3vw, 28px)' }}>
            {/*
              * Conteúdo entra subindo. A `key` no caminho é o que faz o efeito
              * repetir a cada navegação: o `<main>` sobrevive à troca de rota, e
              * animação CSS só dispara na montagem — sem trocar de chave, o
              * conteúdo subiria uma vez, no primeiro carregamento, e nunca mais.
              *
              * `fill-mode-both` segura o primeiro e o último frame. Sem ele o
              * elemento pinta um frame na posição final antes de a animação
              * começar, e a tela dá um solavanco em vez de subir — foi o que
              * fez o overlay da gaveta piscar (ver `components/ui/drawer.tsx`).
              *
              * Movimento curto (8px) e rápido (250ms) de propósito: isto roda em
              * TODA navegação, e o que passa despercebido uma vez incomoda na
              * quinquagésima. Quem pediu `prefers-reduced-motion` não vê nada —
              * o bloco em `globals.css` zera a duração.
              */}
            <div
              key={pathname}
              className="animate-in fade-in-0 slide-in-from-bottom-2 duration-250 fill-mode-both"
            >
              {children}
            </div>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
