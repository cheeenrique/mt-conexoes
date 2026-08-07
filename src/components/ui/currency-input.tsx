'use client';

import { IMaskInput } from 'react-imask';

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
      value={(Number(value) / 100).toFixed(2).replace('.', ',')}
      onAccept={(_masked: string, instance: { unmaskedValue: string }) => {
        const cents = Math.round(parseFloat(instance.unmaskedValue.replace(',', '.') || '0') * 100);
        onValueChange(String(cents));
      }}
      className="h-11 w-full rounded-sm border border-border bg-surface-elevated px-3 font-mono tabular-mono text-foreground"
    />
  );
}
