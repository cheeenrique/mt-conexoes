'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { dunningStepSchema } from '../schema';
import { createDunningStepAction, updateDunningStepAction } from '../actions';
import { toastError, toastSuccess } from '@/lib/toast';
import { messages } from '@/lib/messages';
import { DUNNING_ACTION_OPTIONS } from '@/lib/labels';
import { TemplatePreview } from './template-preview';
import type { DunningStepDTO, PreviewChargeDTO } from '../queries';

type FormValues = z.input<typeof dunningStepSchema>;

export function StepDrawer({
  open,
  onOpenChange,
  ruleId,
  step,
  charges,
  settings,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ruleId: string;
  step: DunningStepDTO | null;
  charges: PreviewChargeDTO[];
  settings: { timezone: string; pixKey: string | null; businessName: string };
}) {
  const { register, handleSubmit, watch, setError, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(dunningStepSchema),
    values: step
      ? { offsetDays: step.offsetDays, action: step.action as FormValues['action'], templateBody: step.templateBody ?? '', isActive: step.isActive }
      : { offsetDays: 0, action: 'SEND_MESSAGE', templateBody: '', isActive: true },
  });

  const templateBody = watch('templateBody') ?? '';

  async function onSubmit(values: FormValues) {
    const result = step
      ? await updateDunningStepAction(step.id, values)
      : await createDunningStepAction(ruleId, values);

    if ('error' in result) {
      if (result.error.code === 'UNKNOWN_TEMPLATE_VARIABLE') {
        setError('templateBody', { message: result.error.message });
      }
      toastError(result.error);
      return;
    }
    toastSuccess(step ? messages.dunning.stepUpdated : messages.dunning.stepCreated);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{step ? `Passo D${step.offsetDays >= 0 ? '+' : ''}${step.offsetDays}` : 'Novo passo'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
          <div>
            <label className="text-sm font-medium text-foreground" htmlFor="offsetDays">Deslocamento (dias, negativo = antes do vencimento)</label>
            <input id="offsetDays" type="number" {...register('offsetDays')} className="mt-1 h-9 w-full rounded-sm border border-border bg-surface px-2 text-sm" />
            {errors.offsetDays && <p className="mt-1 text-xs text-danger">{errors.offsetDays.message}</p>}
          </div>
          <div>
            <label className="text-sm font-medium text-foreground" htmlFor="action">Ação</label>
            <select id="action" {...register('action')} className="mt-1 h-9 w-full rounded-sm border border-border bg-surface px-2 text-sm">
              {DUNNING_ACTION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground" htmlFor="templateBody">Texto (com variáveis {'{{...}}'})</label>
            <textarea id="templateBody" {...register('templateBody')} rows={5} className="mt-1 w-full rounded-sm border border-border bg-surface px-2 py-1.5 text-sm" />
            {errors.templateBody && <p className="mt-1 text-xs text-danger">{errors.templateBody.message}</p>}
          </div>
          {templateBody && (
            <div>
              <p className="mb-1 text-sm font-medium text-foreground">Prévia</p>
              <TemplatePreview templateBody={templateBody} charges={charges} settings={settings} />
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-foreground-muted">
            <input type="checkbox" {...register('isActive')} />
            Passo ativo
          </label>
          <Button type="submit" disabled={isSubmitting}>Salvar</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
