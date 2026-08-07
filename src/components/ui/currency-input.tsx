'use client';

import { IMaskInput } from 'react-imask';

function unmaskedValueToCents(unmaskedValue: string): string {
  const [integerPart, fractionalPart = ''] = unmaskedValue.split(',');
  const integerDigits = (integerPart || '0').replace(/\D/g, '') || '0';
  const fractionalDigits = fractionalPart.replace(/\D/g, '').padEnd(2, '0').slice(0, 2) || '00';
  return String(BigInt(integerDigits) * 100n + BigInt(fractionalDigits));
}

function centsToDisplayValue(cents: string): string {
  const total = BigInt(cents || '0');
  const negative = total < 0n;
  const abs = negative ? -total : total;
  const integerPart = abs / 100n;
  const fractionalPart = (abs % 100n).toString().padStart(2, '0');
  return `${negative ? '-' : ''}${integerPart},${fractionalPart}`;
}

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
      value={centsToDisplayValue(value)}
      onAccept={(_masked: string, instance: { unmaskedValue: string }) => {
        onValueChange(unmaskedValueToCents(instance.unmaskedValue));
      }}
      className="h-11 w-full rounded-sm border border-border bg-surface-elevated px-3 font-mono tabular-mono text-foreground"
    />
  );
}
