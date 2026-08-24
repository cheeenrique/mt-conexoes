'use client';

import { useState, type ReactNode } from 'react';
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
            {children}
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
