import type { ReactNode } from 'react';

export function Header({ title, primaryAction }: { title: string; primaryAction?: ReactNode }) {
  return (
    <header className="flex h-16 items-center justify-between border-b border-border px-4 md:px-6">
      <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
      {primaryAction}
    </header>
  );
}
