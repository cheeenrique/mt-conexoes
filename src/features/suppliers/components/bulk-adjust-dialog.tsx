'use client';

import { useState } from 'react';
import Decimal from 'decimal.js';
import { Check } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { TypeToConfirmDialog } from '@/components/ui/type-to-confirm-dialog';
import { formatCents } from '@/lib/format';
import { marginBadgeTone } from '@/lib/margin-tone';
import { applyBulkAdjustAction } from '../actions';
import { toastError, toastSuccess } from '@/lib/toast';
import type { BulkAdjustPreviewRow } from '../queries';

const BATCH_CONFIRM_THRESHOLD = 100;

function marginLabel(pct: string | null): string {
  return pct === null ? '—' : `${new Decimal(pct).toFixed(1)}%`;
}

export function BulkAdjustDialog({
  open,
  onOpenChange,
  supplierId,
  oldUnitCostCents,
  newUnitCostCents,
  rows,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplierId: string;
  oldUnitCostCents: string;
  newUnitCostCents: string;
  rows: BulkAdjustPreviewRow[];
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  async function apply() {
    if (isApplying) return;
    setIsApplying(true);
    try {
      const result = await applyBulkAdjustAction(supplierId, oldUnitCostCents, newUnitCostCents);
      if ('error' in result) {
        toastError(result.error);
        return;
      }
      toastSuccess(`Reajuste aplicado em ${result.count} assinatura(s).`);
      setConfirmOpen(false);
      onOpenChange(false);
    } catch {
      toastError({ code: 'UNEXPECTED_ERROR', message: 'Falha inesperada ao aplicar o reajuste. Tente novamente.' });
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
        <DialogContent className="w-[640px] bg-surface">
          <DialogHeader>
            <DialogTitle>Custo subiu — {rows.length} assinatura(s) afetada(s)</DialogTitle>
          </DialogHeader>
          <div className="mt-2 flex items-center justify-between gap-3 px-1 text-xs font-semibold uppercase tracking-wide text-foreground-muted">
            <span>Cliente</span>
            <span>Valor atual · Margem atual → depois</span>
          </div>
          <ul className="max-h-80 overflow-y-auto text-sm">
            {rows.map((row) => (
              <li key={row.subscriptionId} className="flex items-center justify-between gap-3 border-b border-border py-2 last:border-0">
                <span className="text-foreground">{row.customerName}</span>
                <span className="font-mono tabular-mono text-foreground-muted">{formatCents(row.oldPriceCents)}</span>
                <span className="flex items-center gap-1.5">
                  <StatusBadge tone={marginBadgeTone(row.oldMarginPercent)}>{marginLabel(row.oldMarginPercent)}</StatusBadge>
                  <span className="text-foreground-muted">→</span>
                  <StatusBadge tone={marginBadgeTone(row.newMarginPercent)}>{marginLabel(row.newMarginPercent)}</StatusBadge>
                </span>
              </li>
            ))}
          </ul>
          <Button disabled={isApplying} onClick={handleConfirmClick}>
            <Check aria-hidden="true" />
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
