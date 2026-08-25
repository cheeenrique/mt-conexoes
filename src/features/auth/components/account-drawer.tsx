'use client';

import { KeyRound } from 'lucide-react';
import { Drawer, DrawerBody, DrawerContent, DrawerHeader } from '@/components/ui/drawer';
import { ChangePasswordForm } from './change-password-form';

/**
 * Conta do operador em gaveta, aberta pela barra lateral.
 *
 * A rota `/conta` existia e **nenhum link do painel apontava para ela** — só
 * chegava quem digitasse a URL. Virou gaveta porque trocar a senha não é
 * navegação: o operador não perde a lista que estava olhando, e volta para ela
 * fechando.
 *
 * A rota continua de pé como link direto e como caminho sem JavaScript.
 */
export function AccountDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent size="default" aria-label="Conta">
        <DrawerHeader
          title={
            <span className="flex items-center gap-2">
              <KeyRound size={20} aria-hidden="true" />
              Conta
            </span>
          }
          subtitle="Acesso do operador ao painel — não é a senha do assinante."
        />
        <DrawerBody>
          <ChangePasswordForm />
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
