'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

/**
 * Cancelar cobrança pede motivo — `cancelChargeSchema` já exigia, e o motivo
 * fica gravado em `charges.cancelReason`. A ação existia no servidor desde a
 * Etapa 2 e nunca ganhou botão: a única saída do operador para uma cobrança
 * errada era pedir para alguém mexer no banco.
 */
export function CancelChargeDialog({
  open,
  onOpenChange,
  customerName,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerName: string;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');

  function handleOpenChange(next: boolean) {
    if (!next) setReason('');
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[420px] bg-surface">
        <DialogHeader>
          <DialogTitle>Cancelar a cobrança de {customerName}?</DialogTitle>
          <DialogDescription>
            Ela sai da lista de cobranças em aberto e a régua para de cobrá-la. O ciclo seguinte só nasce quando houver
            um pagamento — sem cobrança em aberto, o cliente aparece como “Sem cobrança”. Não dá para desfazer.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="cancel-reason">Motivo</Label>
          <input
            id="cancel-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Cliente desistiu do plano"
            className="h-11 w-full rounded-sm border border-border bg-surface-elevated px-3 text-sm text-foreground"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Voltar
          </Button>
          <Button variant="destructive" disabled={reason.trim().length === 0} onClick={() => onConfirm(reason.trim())}>
            Cancelar cobrança
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
