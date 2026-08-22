'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { settingsSchema, type SettingsFormValues } from '../schema';
import { updateSettingsAction } from '../actions';
import { toastError, toastSuccess } from '@/lib/toast';
import { messages } from '@/lib/messages';
import type { SettingsDTO } from '@/lib/settings';
import { IdentificationSection } from './identification-section';
import { ReceivingSection } from './receiving-section';
import { SendingSection } from './sending-section';
import { UnsavedChangesBar } from './unsaved-changes-bar';

export function SettingsForm({
  initial,
  onDirtyChange,
}: {
  initial: SettingsDTO;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const defaultValues: SettingsFormValues = {
    businessName: initial.businessName,
    timezone: initial.timezone,
    quietHourStart: initial.quietHourStart,
    quietHourEnd: initial.quietHourEnd,
    pixKey: initial.pixKey ?? '',
    pixHolderName: initial.pixHolderName ?? '',
    marginAlertPercent: initial.marginAlertPercent,
  };

  const { register, control, handleSubmit, reset, watch, formState: { errors, isSubmitting } } = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues,
  });

  const [savedSnapshot, setSavedSnapshot] = useState(defaultValues);
  const current = watch();
  const dirty = JSON.stringify(current) !== JSON.stringify(savedSnapshot);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  async function onSubmit(values: SettingsFormValues) {
    const result = await updateSettingsAction(values);
    if ('error' in result) {
      toastError(result.error);
      return;
    }
    toastSuccess(messages.settings.saved);
    setSavedSnapshot(values);
  }

  return (
    <form id="settings-form" onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
      <IdentificationSection register={register} errors={errors} />
      <ReceivingSection register={register} pixKey={watch('pixKey') ?? ''} pixHolderName={watch('pixHolderName') ?? ''} />
      <SendingSection
        register={register}
        control={control}
        errors={errors}
        quietHourStart={watch('quietHourStart')}
        quietHourEnd={watch('quietHourEnd')}
      />
      {dirty && <UnsavedChangesBar isSubmitting={isSubmitting} onDiscard={() => reset(savedSnapshot)} />}
    </form>
  );
}
