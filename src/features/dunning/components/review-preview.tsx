'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DUNNING_ACTION_LABELS } from '@/lib/labels';
import { activateDunningRuleAction } from '../actions';
import { toastError, toastSuccess } from '@/lib/toast';
import type { ReviewPreviewDTO } from '../queries';

export function ReviewPreview({ preview }: { preview: ReviewPreviewDTO[] }) {
  const [confirmMode, setConfirmMode] = useState<'send-all' | 'ignore-retroactive' | null>(null);

  async function activate(mode: 'send-all' | 'ignore-retroactive') {
    const result = await activateDunningRuleAction(mode);
    if ('error' in result) {
      toastError(result.error);
      return;
    }
    toastSuccess('Régua ativada.');
    setConfirmMode(null);
  }

  const total = preview.reduce((sum, p) => sum + p.count, 0);

  return (
    <div className="mb-4 rounded-sm border border-warning/40 bg-warning/[.08] p-4">
      <p className="mb-2 text-sm font-bold text-foreground">Régua em revisão — {total} execução(ões) pendente(s)</p>
      <ul className="mb-3 text-sm text-foreground-muted">
        {preview.map((p) => (
          <li key={p.stepId}>
            D{p.offsetDays >= 0 ? '+' : ''}{p.offsetDays} ({DUNNING_ACTION_LABELS[p.action] ?? p.action}): {p.count}
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => setConfirmMode('ignore-retroactive')}>Ignorar retroativos e ativar</Button>
        <Button variant="outline" onClick={() => setConfirmMode('send-all')}>Enviar todas</Button>
      </div>
      <ConfirmDialog
        open={confirmMode !== null}
        onOpenChange={(open) => !open && setConfirmMode(null)}
        title="Ativar régua"
        description={confirmMode === 'ignore-retroactive'
          ? 'As execuções pendentes de revisão serão descartadas e a régua passa a valer só pra frente.'
          : 'A régua fica ativa. As execuções pendentes de revisão continuam registradas, sem reprocessamento automático.'}
        confirmLabel="Ativar"
        onConfirm={() => confirmMode && activate(confirmMode)}
      />
    </div>
  );
}
