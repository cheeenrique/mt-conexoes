'use client';

import { IMaskInput } from 'react-imask';
import { parseDecimalStringToCents } from '@/core/money';
import { centsToDecimalString } from '@/lib/format';

export function CurrencyInput({
  value,
  onValueChange,
  id,
}: {
  value: string; // centavos, como string
  onValueChange: (cents: string) => void;
  id?: string;
}) {
  return (
    <IMaskInput
      id={id}
      mask="R$ num"
      blocks={{
        num: {
          mask: Number,
          scale: 2,
          thousandsSeparator: '.',
          radix: ',',
          padFractionalZeros: true,
          normalizeZeros: true,
        },
      }}
      unmask={false}
      value={centsToDecimalString(value)}
      onAccept={(_masked: string, instance: { unmaskedValue: string }) => {
        onValueChange(parseDecimalStringToCents(instance.unmaskedValue));
      }}
      className="h-11 w-full rounded-sm border border-border bg-surface-elevated px-3 font-mono tabular-mono text-foreground"
    />
  );
}
