'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { TypeToConfirmDialog } from '@/components/ui/type-to-confirm-dialog';
import { formatCents } from '@/lib/format';
import { applyBulkAdjustAction } from '../actions';
import { toastError, toastSuccess } from '@/lib/toast';
import type { BulkAdjustPreviewRow } from '../queries';

const BATCH_CONFIRM_THRESHOLD = 100;

export function BulkAdjustDialog({
  open,
  onOpenChange,
  supplierId,
  rows,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplierId: string;
  rows: BulkAdjustPreviewRow[];
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  async function apply() {
    if (isApplying) return;
    setIsApplying(true);
    try {
      const result = await applyBulkAdjustAction(supplierId);
      if ('error' in result) {
        toastError(result.error);
        return;
      }
      toastSuccess(`Reajuste aplicado em ${result.count} assinatura(s).`);
      setConfirmOpen(false);
      onOpenChange(false);
    } finally {
      setIsApplying(false);
    }
  }

  function handleConfirmClick() {
    if (rows.length > BATCH_CONFIRM_THRESHOLD) {
      setConfirmOpen(true);
      return;
    }
    apply();
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Custo subiu — {rows.length} assinatura(s) afetada(s)</DialogTitle>
          </DialogHeader>
          <ul className="mt-2 max-h-80 overflow-y-auto text-sm">
            {rows.map((row) => (
              <li key={row.subscriptionId} className="flex items-center justify-between gap-3 border-b border-border py-2 last:border-0">
                <span className="text-foreground">{row.customerName}</span>
                <span className="font-mono text-foreground-muted">
                  {formatCents(row.oldCostCents)} → {formatCents(row.newCostCents)}
                </span>
                <span className="font-mono text-foreground">
                  {formatCents(row.oldPriceCents)} → {formatCents(row.newPriceCents)}
                </span>
              </li>
            ))}
          </ul>
          <Button disabled={isApplying} onClick={handleConfirmClick}>
            {rows.length > BATCH_CONFIRM_THRESHOLD ? 'Continuar' : `Aplicar em ${rows.length} assinatura(s)`}
          </Button>
        </DialogContent>
      </Dialog>
      <TypeToConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Confirmar reajuste em lote"
        description={`Você está prestes a reajustar ${rows.length} assinaturas. Digite o número pra confirmar.`}
        expectedValue={rows.length}
        confirmLabel="Aplicar"
        onConfirm={apply}
      />
    </>
  );
}
