'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Loader2 } from 'lucide-react';
import type { z } from 'zod';
import { Drawer, DrawerBody, DrawerContent, DrawerFooter, DrawerHeader } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toastError, toastSuccess } from '@/lib/toast';
import { messages } from '@/lib/messages';
import { dunningStepSchema } from '../schema';
import { daysOf, directionOf, offsetDaysFrom, stepLabel } from '../step-offset';
import { createDunningStepAction, deleteDunningStepAction, updateDunningStepAction } from '../actions';
import { StepScheduleFields } from './step-schedule-fields';
import { StepMessageFields } from './step-message-fields';
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
  const [confirmDelete, setConfirmDelete] = useState(false);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(dunningStepSchema),
    values: step
      ? {
          days: daysOf(step.offsetDays),
          direction: directionOf(step.offsetDays),
          action: step.action as FormValues['action'],
          templateBody: step.templateBody ?? '',
          metaTemplateName: step.metaTemplateName ?? '',
          isActive: step.isActive,
        }
      : { days: 1, direction: 'after', action: 'SEND_MESSAGE', templateBody: '', metaTemplateName: '', isActive: true },
  });

  const templateBody = watch('templateBody') ?? '';
  const action = watch('action');
  const direction = watch('direction');
  const label = stepLabel(offsetDaysFrom(Number(watch('days')) || 0, direction));

  async function onSubmit(values: FormValues) {
    const result = step
      ? await updateDunningStepAction(step.id, values)
      : await createDunningStepAction(ruleId, values);

    if ('error' in result) {
      if (result.error.code === 'UNKNOWN_TEMPLATE_VARIABLE') setError('templateBody', { message: result.error.message });
      if (result.error.code === 'DUPLICATE_STEP_OFFSET') {
        setError('days', { message: `Já existe um passo em ${label}. Edite o existente ou escolha outro dia.` });
      }
      toastError(result.error);
      return;
    }
    toastSuccess(step ? messages.dunning.stepUpdated : messages.dunning.stepCreated);
    onOpenChange(false);
  }

  async function remove() {
    if (!step) return;
    const result = await deleteDunningStepAction(step.id);
    setConfirmDelete(false);
    if ('error' in result) {
      toastError(result.error);
      return;
    }
    toastSuccess(messages.dunning.stepDeleted);
    onOpenChange(false);
  }

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent width={560}>
          <DrawerHeader
            title={step ? `Passo ${stepLabel(step.offsetDays)}` : 'Novo passo'}
            subtitle={
              label === 'D0'
                ? 'No dia do vencimento'
                : `${label} · ${direction === 'before' ? 'antes' : 'depois'} do vencimento`
            }
          />
          <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
            <DrawerBody>
              <StepScheduleFields register={register} errors={errors} action={action} />

              {action === 'SEND_MESSAGE' && (
                <StepMessageFields
                  templateBody={templateBody}
                  registration={register('templateBody')}
                  onValueChange={(next) => setValue('templateBody', next, { shouldDirty: true })}
                  error={errors.templateBody?.message}
                  metaTemplateNameRegistration={register('metaTemplateName')}
                  charges={charges}
                  settings={settings}
                />
              )}
            </DrawerBody>

            <DrawerFooter>
              <Button type="submit" size="lg" className="min-w-[200px] flex-1" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Check aria-hidden="true" />}
                Salvar passo
              </Button>
              <Button type="button" variant="outline" size="lg" className="min-w-[140px] flex-1" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              {step && (
                <Button type="button" variant="destructive" size="lg" onClick={() => setConfirmDelete(true)}>
                  Remover passo
                </Button>
              )}
            </DrawerFooter>
          </form>
        </DrawerContent>
      </Drawer>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Remover passo"
        description={`O passo ${step ? stepLabel(step.offsetDays) : ''} deixa de existir nesta régua. Não dá para desfazer.`}
        confirmLabel="Remover"
        onConfirm={remove}
      />
    </>
  );
}
