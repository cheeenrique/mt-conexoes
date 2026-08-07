'use client';

import { useState, type ReactNode } from 'react';
import { Sidebar } from './sidebar';
import { Header } from './header';
import { PauseBanner } from './pause-banner';

export function AppShell({
  title,
  primaryAction,
  children,
}: {
  title: string;
  primaryAction?: ReactNode;
  children: ReactNode;
}) {
  // Estado 100% local de UI — não persiste no banco. O wiring real com
  // `Settings.sendingPaused` só existe na Etapa 1+, quando o modelo
  // `Settings` for criado (ver CLAUDE.md, tabela de convenções).
  const [paused, setPaused] = useState(false);

  return (
    <div className="flex">
      <Sidebar paused={paused} onTogglePause={() => setPaused((p) => !p)} />
      <div className="flex min-h-screen flex-1 flex-col">
        <PauseBanner paused={paused} />
        <Header title={title} primaryAction={primaryAction} />
        <main className="flex-1" style={{ padding: 'clamp(16px, 3vw, 28px)' }}>
          {children}
        </main>
      </div>
    </div>
  );
}
