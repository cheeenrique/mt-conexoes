'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { settingsSchema } from '../schema';
import { updateSettingsAction } from '../actions';
import { toastError, toastSuccess } from '@/lib/toast';
import { messages } from '@/lib/messages';
import type { SettingsDTO } from '../queries';

type FormValues = z.infer<typeof settingsSchema>;

export function SettingsForm({
  initial,
  onDirtyChange,
}: {
  initial: SettingsDTO;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const defaultValues: FormValues = {
    businessName: initial.businessName,
    timezone: initial.timezone,
    quietHourStart: initial.quietHourStart,
    quietHourEnd: initial.quietHourEnd,
    pixKey: initial.pixKey ?? '',
    pixHolderName: initial.pixHolderName ?? '',
    marginAlertPercent: initial.marginAlertPercent,
  };

  const { register, handleSubmit, watch, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues,
  });

  const [savedSnapshot, setSavedSnapshot] = useState(defaultValues);
  const current = watch();
  const dirty = JSON.stringify(current) !== JSON.stringify(savedSnapshot);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  async function onSubmit(values: FormValues) {
    const result = await updateSettingsAction(values);
    if ('error' in result) {
      toastError(result.error);
      return;
    }
    toastSuccess(messages.settings.saved);
    setSavedSnapshot(values);
  }

  const pixKey = watch('pixKey');
  const pixHolderName = watch('pixHolderName');

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6 pb-20">
      <section className="rounded border border-border bg-surface p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-foreground-muted">Identificação</h2>
        <div className="flex flex-col gap-4">
          <div>
            <Label htmlFor="businessName">Nome do negócio</Label>
            <Input id="businessName" aria-invalid={!!errors.businessName} {...register('businessName')} className="h-11" />
            {errors.businessName && <p className="mt-1 text-sm text-danger">{errors.businessName.message}</p>}
          </div>
          <div>
            <Label htmlFor="timezone">Fuso horário</Label>
            <select id="timezone" {...register('timezone')} className="h-11 w-full rounded-sm border border-border bg-surface-elevated px-3 text-sm text-foreground">
              <option value="America/Sao_Paulo">América/São Paulo</option>
              <option value="America/Manaus">América/Manaus</option>
              <option value="America/Rio_Branco">América/Rio Branco</option>
            </select>
          </div>
        </div>
      </section>

      <section className="rounded border border-border bg-surface p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-foreground-muted">Recebimento</h2>
        <div className="flex flex-col gap-4">
          <div>
            <Label htmlFor="pixKey">Chave Pix</Label>
            <Input id="pixKey" {...register('pixKey')} className="h-11" />
          </div>
          <div>
            <Label htmlFor="pixHolderName">Titular</Label>
            <Input id="pixHolderName" {...register('pixHolderName')} className="h-11" />
          </div>
          {pixKey && pixHolderName && (
            <p className="text-xs text-foreground-muted">Pix {pixKey} em nome de {pixHolderName}</p>
          )}
        </div>
      </section>

      <section className="rounded border border-border bg-surface p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-foreground-muted">Envio e alertas</h2>
        <div className="flex flex-col gap-4">
          <div className="flex gap-4">
            <div className="flex-1">
              <Label htmlFor="quietHourStart">Envia a partir de</Label>
              <Input id="quietHourStart" type="number" min={0} max={23} aria-invalid={!!errors.quietHourStart} {...register('quietHourStart', { valueAsNumber: true })} className="h-11" />
              {errors.quietHourStart && <p className="mt-1 text-sm text-danger">{errors.quietHourStart.message}</p>}
            </div>
            <div className="flex-1">
              <Label htmlFor="quietHourEnd">Para de enviar às</Label>
              <Input id="quietHourEnd" type="number" min={0} max={23} aria-invalid={!!errors.quietHourEnd} {...register('quietHourEnd', { valueAsNumber: true })} className="h-11" />
              {errors.quietHourEnd && <p className="mt-1 text-sm text-danger">{errors.quietHourEnd.message}</p>}
            </div>
          </div>
          <div>
            <Label htmlFor="marginAlertPercent">Alertar margem abaixo de (%)</Label>
            <Input id="marginAlertPercent" aria-invalid={!!errors.marginAlertPercent} {...register('marginAlertPercent')} className="h-11" />
            {errors.marginAlertPercent && <p className="mt-1 text-sm text-danger">{errors.marginAlertPercent.message}</p>}
          </div>
          <p className="text-xs text-foreground-muted">
            Mensagem calculada fora da janela sai no primeiro horário permitido. O alerta de margem não bloqueia venda.
          </p>
        </div>
      </section>

      {dirty && (
        <div className="fixed bottom-0 left-60 right-0 flex items-center justify-between border-t-2 border-brand bg-surface px-6 py-3">
          <span className="text-sm text-foreground">Alterações ainda não salvas</span>
          <div className="flex gap-3">
            <Button type="button" variant="outline" onClick={() => reset(savedSnapshot)}>Descartar</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Salvando...' : 'Salvar alterações'}</Button>
          </div>
        </div>
      )}
    </form>
  );
}
