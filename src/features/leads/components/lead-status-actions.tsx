'use client';

import { useState, useTransition } from 'react';
import { Check, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toastError, toastSuccess } from '@/lib/toast';
import { setLeadStatusAction } from '../actions';

/**
 * Situações que não são conversão. Ficam no drawer, e não como ícones na
 * linha, porque o handoff fixa duas ações por linha (WhatsApp e converter) —
 * e sem elas os chips "Contatado" e "Descartado" nunca teriam conteúdo.
 *
 * ⚠️ Descartar não apaga nada (regra 3 do handoff): o lead continua na base e
 * continua buscável.
 */
export function LeadStatusActions({
  leadId,
  status,
  onDone,
}: {
  leadId: string;
  status: 'NEW' | 'CONTACTED' | 'DISCARDED';
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  function apply(next: 'NEW' | 'CONTACTED' | 'DISCARDED', successMessage: string) {
    startTransition(async () => {
      const result = await setLeadStatusAction({ leadId, status: next });
      if ('error' in result) {
        toastError(result.error);
        return;
      }
      toastSuccess(successMessage);
      onDone();
    });
  }

  return (
    <div className="flex flex-wrap gap-2 border-t border-border pt-4">
      {status !== 'CONTACTED' && (
        <Button variant="outline" size="lg" disabled={pending} onClick={() => apply('CONTACTED', 'Lead marcado como contatado.')}>
          <Check aria-hidden="true" />
          Marcar como contatado
        </Button>
      )}
      {status === 'DISCARDED' ? (
        <Button variant="outline" size="lg" disabled={pending} onClick={() => apply('NEW', 'Lead voltou para a fila.')}>
          <RefreshCw aria-hidden="true" />
          Reabrir como novo
        </Button>
      ) : (
        <Button variant="destructive" size="lg" disabled={pending} onClick={() => setConfirmingDiscard(true)}>
          Descartar
        </Button>
      )}
      <ConfirmDialog
        open={confirmingDiscard}
        onOpenChange={setConfirmingDiscard}
        title="Descartar este lead?"
        description="Ele sai da fila de trabalho, mas continua na base e continua aparecendo na busca."
        confirmLabel="Descartar"
        onConfirm={() => {
          setConfirmingDiscard(false);
          apply('DISCARDED', 'Lead descartado.');
        }}
      />
    </div>
  );
}
