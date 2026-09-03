'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import {
  LayoutDashboard, Users, Receipt, MessageSquare, GitCommitHorizontal,
  Inbox, ChartNoAxesColumn, Truck, Layers, Settings, Pause, Play, KeyRound,
} from 'lucide-react';
import { Logo } from '@/components/ui/logo';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { AccountDrawer } from '@/features/auth/components/account-drawer';

// Ordem e rótulos vêm do handoff (README §Sidebar). "Canais" não é item de
// menu no handoff — é a aba "Canais de WhatsApp" dentro de Ajustes
// (/settings?aba=canais). Não existe rota /channels separada.
const MENU_ITEMS = [
  { href: '/', label: 'Início', icon: LayoutDashboard },
  { href: '/customers', label: 'Clientes', icon: Users },
  { href: '/charges', label: 'Cobranças', icon: Receipt },
  { href: '/messages', label: 'Mensagens', icon: MessageSquare },
  { href: '/dunning', label: 'Réguas', icon: GitCommitHorizontal },
  { href: '/leads', label: 'Leads', icon: Inbox },
  { href: '/reports', label: 'Relatórios', icon: ChartNoAxesColumn },
  { href: '/suppliers', label: 'Fornecedores', icon: Truck },
  { href: '/plans', label: 'Planos', icon: Layers },
  { href: '/settings', label: 'Ajustes', icon: Settings },
];

function killSwitchLabel(paused: boolean) {
  return paused ? 'Envios pausados, retomar' : 'Pausar envios';
}

/** Conteúdo compartilhado entre a sidebar fixa (≥900px) e a gaveta (<900px). */
function SidebarContent({
  pathname,
  paused,
  onTogglePause,
  onOpenAccount,
  onNavigate,
}: {
  pathname: string;
  paused: boolean;
  onTogglePause: () => void;
  onOpenAccount: () => void;
  onNavigate?: () => void;
}) {
  return (
    <>
      <div className="flex h-16 items-center border-b border-border px-4 text-foreground">
        <Logo variant="row" />
      </div>
      <nav className="flex-1 overflow-y-auto py-2">
        {MENU_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
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

        {/* Conta é botão, não link: abre em gaveta para o operador não perder a
            lista que estava olhando só para trocar a senha. A rota /conta segue
            existindo como link direto — ver AccountDrawer. */}
        <button
          type="button"
          onClick={() => {
            onNavigate?.();
            onOpenAccount();
          }}
          className="flex h-10 w-full items-center gap-2.5 border-l-2 border-transparent px-4 text-sm font-semibold text-foreground-muted"
        >
          <KeyRound size={17} />
          Conta
        </button>
      </nav>
      <button
        type="button"
        aria-label={killSwitchLabel(paused)}
        title={killSwitchLabel(paused)}
        onClick={onTogglePause}
        className={`m-3 flex h-11 items-center justify-center gap-2 rounded border text-sm font-semibold ${
          paused ? 'border-brand bg-brand text-foreground' : 'border-border text-foreground-muted'
        }`}
      >
        {paused ? <Play size={16} /> : <Pause size={16} />}
        {killSwitchLabel(paused)}
      </button>
    </>
  );
}

export function Sidebar({
  paused,
  onTogglePause,
  mobileOpen,
  onMobileOpenChange,
}: {
  paused: boolean;
  onTogglePause: () => void;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
}) {
  const pathname = usePathname();

  // Estado de UI local: a gaveta da conta não sobrevive à navegação nem ao
  // reload, e não é dado de servidor.
  const [accountOpen, setAccountOpen] = useState(false);

  // Confirmação só do lado "pausar" — retomar segue de um clique só. O efeito
  // continua imediato assim que confirmado (T8 não muda: nada fica em fila
  // esperando); a trava existe pra clique sem querer no botão que para o
  // envio pra todo mundo, não pra atrasar o kill switch de verdade.
  const [confirmPauseOpen, setConfirmPauseOpen] = useState(false);

  function handleTogglePauseClick() {
    if (paused) {
      onTogglePause();
      return;
    }
    setConfirmPauseOpen(true);
  }

  function handleConfirmPause() {
    setConfirmPauseOpen(false);
    onTogglePause();
  }

  return (
    <>
      <AccountDrawer open={accountOpen} onOpenChange={setAccountOpen} />
      <ConfirmDialog
        open={confirmPauseOpen}
        onOpenChange={setConfirmPauseOpen}
        title="Pausar os envios?"
        description="Nenhuma mensagem da régua sai enquanto estiver pausado — nem cobrança nova, nem lembrete. Retomar depois é um clique só."
        confirmLabel="Pausar envios"
        onConfirm={handleConfirmPause}
      />

      {/* Sidebar fixa — só existe em telas ≥900px (README §Responsivo). */}
      <aside className="sticky top-0 hidden h-screen w-60 flex-col border-r border-border md:flex">
        <SidebarContent
          pathname={pathname}
          paused={paused}
          onTogglePause={handleTogglePauseClick}
          onOpenAccount={() => setAccountOpen(true)}
        />
      </aside>

      {/* Gaveta mobile — <900px. Base UI Dialog cuida de foco preso, Esc e
          clique no overlay fechando (README: gaveta 260px, z-index 70). */}
      <DialogPrimitive.Root open={mobileOpen} onOpenChange={onMobileOpenChange}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Backdrop className="fixed inset-0 z-[70] bg-black/60 md:hidden" />
          <DialogPrimitive.Popup
            aria-label="Menu"
            className="fixed inset-y-0 left-0 z-[70] flex h-full w-[260px] flex-col border-r border-border bg-background outline-none md:hidden"
          >
            <SidebarContent
              pathname={pathname}
              paused={paused}
              onTogglePause={handleTogglePauseClick}
              onOpenAccount={() => setAccountOpen(true)}
              onNavigate={() => onMobileOpenChange(false)}
            />
          </DialogPrimitive.Popup>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
