'use client';

import { IMaskInput } from 'react-imask';

function toE164(digits: string): string {
  return digits ? `+55${digits}` : '';
}

function fromE164(e164: string): string {
  return e164.replace(/^\+55/, '');
}

export function PhoneInput({
  value,
  onValueChange,
  id,
}: {
  value: string; // E.164, ex.: +5511999998888
  onValueChange: (e164: string) => void;
  id?: string;
}) {
  return (
    <IMaskInput
      id={id}
      mask="(00) 00000-0000"
      value={fromE164(value)}
      unmask={true}
      onAccept={(_masked: string, instance: { unmaskedValue: string }) => {
        onValueChange(toE164(instance.unmaskedValue));
      }}
      className="h-11 w-full rounded-sm border border-border bg-surface-elevated px-3 font-mono tabular-mono text-foreground"
    />
  );
}
