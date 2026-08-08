'use client';

import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { StatusBadge } from '@/components/ui/status-badge';
import { DUNNING_ACTION_LABELS } from '@/lib/labels';
import { deleteDunningStepAction } from '../actions';
import { toastError, toastSuccess } from '@/lib/toast';
import { messages } from '@/lib/messages';
import { StepDrawer } from './step-drawer';
import type { DunningStepDTO, PreviewChargeDTO } from '../queries';

export function StepList({
  ruleId,
  steps,
  charges,
  settings,
}: {
  ruleId: string;
  steps: DunningStepDTO[];
  charges: PreviewChargeDTO[];
  settings: { timezone: string; pixKey: string | null; businessName: string };
}) {
  const [editing, setEditing] = useState<DunningStepDTO | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [deleting, setDeleting] = useState<DunningStepDTO | null>(null);

  async function confirmDelete() {
    if (!deleting) return;
    const result = await deleteDunningStepAction(deleting.id);
    if ('error' in result) toastError(result.error);
    else toastSuccess(messages.dunning.stepDeleted);
    setDeleting(null);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button onClick={() => { setEditing(null); setDrawerOpen(true); }}>
          <Plus size={16} /> Novo passo
        </Button>
      </div>
      {steps.map((step) => (
        <div key={step.id} className="flex items-center justify-between rounded-sm border border-border bg-surface p-4">
          <div>
            <p className="font-bold text-foreground">D{step.offsetDays >= 0 ? '+' : ''}{step.offsetDays} — {DUNNING_ACTION_LABELS[step.action] ?? step.action}</p>
            {step.templateBody && <p className="mt-1 line-clamp-1 text-sm text-foreground-muted">{step.templateBody}</p>}
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge tone={step.isActive ? 'success' : 'neutral'}>{step.isActive ? 'Ativo' : 'Inativo'}</StatusBadge>
            <button type="button" onClick={() => { setEditing(step); setDrawerOpen(true); }} aria-label="Editar passo" className="rounded-sm p-1.5 text-foreground-muted hover:text-foreground">
              <Pencil size={16} />
            </button>
            <button type="button" onClick={() => setDeleting(step)} aria-label="Remover passo" className="rounded-sm p-1.5 text-foreground-muted hover:text-danger">
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      ))}
      <StepDrawer open={drawerOpen} onOpenChange={setDrawerOpen} ruleId={ruleId} step={editing} charges={charges} settings={settings} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Remover passo"
        description={`Tem certeza que quer remover o passo D${deleting && deleting.offsetDays >= 0 ? '+' : ''}${deleting?.offsetDays}? Essa ação não pode ser desfeita.`}
        confirmLabel="Remover"
        onConfirm={confirmDelete}
      />
    </div>
  );
}
