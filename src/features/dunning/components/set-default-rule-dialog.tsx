'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toastError, toastSuccess } from '@/lib/toast';
import { setDefaultDunningRuleAction } from '../actions';

/**
 * Trocar a régua padrão muda quem cobra todo mundo, então é confirmação
 * explícita e o texto diz qual sai, qual entra e quantas assinaturas passam a
 * ser avaliadas pela nova.
 */
export function SetDefaultRuleDialog({
  open,
  onOpenChange,
  rule,
  currentDefaultName,
  evaluableSubscriptions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: { id: string; name: string; status: string };
  currentDefaultName: string | null;
  evaluableSubscriptions: number;
}) {
  const [busy, setBusy] = useState(false);
  const evaluates = rule.status === 'REVIEW' || rule.status === 'ACTIVE';

  async function confirm() {
    setBusy(true);
    const result = await setDefaultDunningRuleAction(rule.id);
    setBusy(false);
    if ('error' in result) {
      toastError(result.error);
      return;
    }
    toastSuccess(`“${rule.name}” agora é a régua padrão.`);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[440px] max-w-[calc(100%-2rem)] bg-surface sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Trocar a régua padrão</DialogTitle>
          <DialogDescription>
            {currentDefaultName
              ? `“${currentDefaultName}” deixa de ser a padrão e “${rule.name}” passa a ser.`
              : `“${rule.name}” passa a ser a régua padrão.`}{' '}
            {evaluates
              ? `${evaluableSubscriptions} assinatura(s) ativa(s) passam a ser avaliadas por ela.`
              : 'Enquanto ela estiver em rascunho ou pausada, o motor não avalia ninguém — nenhuma cobrança automática sai até você mandar para revisão e ativar.'}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={confirm} disabled={busy}>
            Definir como padrão
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
