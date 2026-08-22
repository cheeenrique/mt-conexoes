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
  onBlur,
  id,
  disabled,
}: {
  value: string; // E.164, ex.: +5511999998888
  onValueChange: (e164: string) => void;
  /** Repassado ao `<input>` interno — usado para checar duplicidade ao sair do campo. */
  onBlur?: () => void;
  id?: string;
  disabled?: boolean;
}) {
  return (
    <IMaskInput
      id={id}
      mask="(00) 00000-0000"
      value={fromE164(value)}
      unmask={true}
      disabled={disabled}
      onAccept={(_masked: string, instance: { unmaskedValue: string }) => {
        onValueChange(toE164(instance.unmaskedValue));
      }}
      onBlur={onBlur}
      className="h-11 w-full rounded-sm border border-border bg-surface-elevated px-3 font-mono tabular-mono text-foreground disabled:cursor-not-allowed disabled:opacity-50"
    />
  );
}
