import type { ReactNode } from 'react';
import { Sidebar } from './sidebar';
import { Header } from './header';

export function AppShell({
  title,
  primaryAction,
  children,
}: {
  title: string;
  primaryAction?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex">
      <Sidebar />
      <div className="flex min-h-screen flex-1 flex-col">
        <Header title={title} primaryAction={primaryAction} />
        <main className="flex-1 p-4 md:p-7" style={{ padding: 'clamp(16px, 3vw, 28px)' }}>
          {children}
        </main>
      </div>
    </div>
  );
}
