'use client';

import * as React from 'react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { XIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

/**
 * Gaveta lateral direita — o "drawer" do handoff de design (README §"Padrão de
 * drawer"): overlay `rgba(0,0,0,.6)`, conteúdo encostado à direita,
 * `width: min(Xpx, 100%)`, altura total, cabeçalho sticky e rodapé com ação
 * primária.
 *
 * Construído sobre a mesma primitiva do `Dialog` porque é dela que vêm o foco
 * preso, o `Esc` que fecha, o `aria-modal` e a devolução do foco ao gatilho —
 * reimplementar isso à mão é onde a acessibilidade de diálogo costuma morrer.
 * A diferença é só posicionamento.
 *
 * ⚠️ Vários diálogos do painel ainda são modais centralizados que o handoff
 * descreve como gaveta (cliente, plano, fornecedor, mensagem). Migrar cada um é
 * trabalho separado — este componente é a base para isso.
 */

function Drawer({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="drawer" {...props} />;
}

/**
 * As três larguras do handoff (README §"Padrão de drawer"): `lg` para
 * cliente/lead/assinatura/passo da régua/nova régua, `default` para
 * plano/fornecedor, `sm` para mensagem. Sem escape hatch numérico — todo
 * consumidor declara um destes três, nunca um `width` cru.
 */
const DRAWER_SIZE_PX = {
  lg: 560,
  default: 520,
  sm: 480,
} as const;

type DrawerSize = keyof typeof DRAWER_SIZE_PX;

function DrawerContent({
  className,
  children,
  size,
  ...props
}: DialogPrimitive.Popup.Props & { size: DrawerSize }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop
        data-slot="drawer-overlay"
        className="fixed inset-0 z-50 bg-black/60 duration-100 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
      />
      <DialogPrimitive.Popup
        data-slot="drawer-content"
        style={{ width: `min(${DRAWER_SIZE_PX[size]}px, 100%)` }}
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex h-full flex-col overflow-y-auto border-l border-border bg-background text-foreground shadow-[0_16px_40px_rgba(0,0,0,.6)] outline-none duration-150',
          'data-open:animate-in data-open:slide-in-from-right data-closed:animate-out data-closed:slide-out-to-right',
          className,
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  );
}

function DrawerHeader({
  title,
  subtitle,
  children,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-background px-5 py-4">
      <div className="min-w-0">
        <DialogPrimitive.Title className="text-xl font-extrabold tracking-[-.01em] text-foreground">
          {title}
        </DialogPrimitive.Title>
        {subtitle ? (
          <DialogPrimitive.Description className="text-[13px] text-foreground-muted">
            {subtitle}
          </DialogPrimitive.Description>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {children}
        <DialogPrimitive.Close
          render={<Button variant="outline" size="icon-lg" aria-label="Fechar" />}
        >
          <XIcon />
        </DialogPrimitive.Close>
      </div>
    </div>
  );
}

function DrawerBody({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-1 flex-col gap-4 p-5', className)} {...props} />;
}

/** Seção em cartão `#141417` com o rótulo uppercase do handoff. */
function DrawerSection({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn('flex flex-col gap-3.5 rounded border border-border bg-surface p-4', className)}>
      <span className="text-xs font-bold uppercase tracking-[.08em] text-foreground-muted">{label}</span>
      {children}
    </section>
  );
}

function DrawerFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-wrap gap-2.5 px-5 pb-5', className)} {...props} />;
}

export { Drawer, DrawerContent, DrawerHeader, DrawerBody, DrawerSection, DrawerFooter };
