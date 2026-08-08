'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Users, Receipt, MessageSquare, GitCommitHorizontal,
  Inbox, ChartNoAxesColumn, Truck, Layers, Settings, Pause, Play,
} from 'lucide-react';

const MENU_ITEMS = [
  { href: '/', label: 'Início', icon: LayoutDashboard },
  { href: '/customers', label: 'Clientes', icon: Users },
  { href: '/charges', label: 'Cobranças', icon: Receipt },
  { href: '/mensagens', label: 'Mensagens', icon: MessageSquare },
  { href: '/regua', label: 'Réguas', icon: GitCommitHorizontal },
  { href: '/leads', label: 'Leads', icon: Inbox },
  { href: '/relatorios', label: 'Relatórios', icon: ChartNoAxesColumn },
  { href: '/suppliers', label: 'Fornecedores', icon: Truck },
  { href: '/plans', label: 'Planos', icon: Layers },
  { href: '/settings', label: 'Ajustes', icon: Settings },
];

export function Sidebar({
  paused,
  onTogglePause,
}: {
  paused: boolean;
  onTogglePause: () => void;
}) {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 flex h-screen w-60 flex-col border-r border-border">
      <div className="flex h-16 items-center gap-2.5 px-4">
        <span className="flex h-7 w-7 items-center justify-center rounded-sm bg-brand text-sm font-black text-background">
          MT
        </span>
        <span className="text-base font-extrabold text-foreground">
          MT <span className="font-normal">Conexões</span>
        </span>
      </div>
      <nav className="flex-1 overflow-y-auto py-2">
        {MENU_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`flex h-10 items-center gap-2.5 border-l-2 px-4 text-sm font-semibold ${
                active
                  ? 'border-brand bg-surface text-foreground'
                  : 'border-transparent text-foreground-muted'
              }`}
            >
              <Icon size={17} />
              {label}
            </Link>
          );
        })}
      </nav>
      <button
        type="button"
        aria-label={paused ? 'Envios pausados — retomar' : 'Pausar envios'}
        title={paused ? 'Envios pausados — retomar' : 'Pausar envios'}
        onClick={onTogglePause}
        className={`m-3 flex h-11 items-center justify-center gap-2 rounded border text-sm font-semibold ${
          paused ? 'border-brand bg-brand text-background' : 'border-border text-foreground-muted'
        }`}
      >
        {paused ? <Play size={16} /> : <Pause size={16} />}
        {paused ? 'Envios pausados — retomar' : 'Pausar envios'}
      </button>
    </aside>
  );
}
