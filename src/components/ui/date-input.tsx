'use client';

import { IMaskInput } from 'react-imask';

export function DateInput({
  value,
  onValueChange,
  id,
}: {
  value: string; // ISO yyyy-MM-dd
  onValueChange: (isoDate: string) => void;
  id?: string;
}) {
  return (
    <IMaskInput
      id={id}
      mask="00/00/0000"
      value={value ? value.split('-').reverse().join('/') : ''}
      unmask={false}
      onAccept={(masked: string) => {
        const [day, month, year] = masked.split('/');
        if (day && month && year?.length === 4) {
          onValueChange(`${year}-${month}-${day}`);
        }
      }}
      className="h-11 w-full rounded-sm border border-border bg-surface-elevated px-3 font-mono tabular-mono text-foreground"
    />
  );
}
