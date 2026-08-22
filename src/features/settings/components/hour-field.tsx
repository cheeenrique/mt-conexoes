'use client';

import { Controller, type Control, type FieldPath } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import type { SettingsFormValues } from '../schema';

function hourToTimeValue(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

// `type="time"` emite "HH:MM" — o domínio só guarda a hora (CLAUDE.md §Data e
// fuso, T6 quiet hours), então o minuto é sempre descartado aqui, nos dois
// sentidos, em vez de deixar a conversão implícita no schema.
function timeValueToHour(timeValue: string): number {
  const [rawHour] = timeValue.split(':');
  const parsed = Number(rawHour);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(23, Math.max(0, parsed));
}

/** Campo de hora inteira (0–23) exibido como "08:00", em mono. */
export function HourField({
  id,
  control,
  name,
  ariaInvalid,
}: {
  id: string;
  control: Control<SettingsFormValues>;
  name: FieldPath<SettingsFormValues>;
  ariaInvalid?: boolean;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <Input
          id={id}
          type="time"
          step={3600}
          value={hourToTimeValue(field.value as number)}
          onChange={(event) => field.onChange(timeValueToHour(event.target.value))}
          onBlur={field.onBlur}
          aria-invalid={ariaInvalid}
          className="h-11 font-mono tabular-mono"
        />
      )}
    />
  );
}
