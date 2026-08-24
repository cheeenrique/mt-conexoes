'use client';

import { digitsToCents } from '@/core/money';
import { formatCents } from '@/lib/format';

/**
 * Campo de dinheiro. Trabalha em centavos na entrada e na saída — `value` e
 * `onValueChange` são sempre string de centavos, nunca `number`.
 *
 * ⚠️ É um **acumulador de centavos**, não um campo decimal: o dígito digitado
 * entra pela direita, como numa maquininha. Digitar `1`,`2`,`3`,`4` num campo
 * zerado dá `R$ 12,34`.
 *
 * A versão anterior usava `IMaskInput` controlado e **perdia dígito**: o valor
 * voltava do estado do pai num formato diferente do que a máscara exibia, a
 * máscara reescrevia o campo, o cursor ia para o fim e o dígito seguinte caía
 * depois da vírgula, onde a escala de 2 casas o descartava. Sem separador
 * decimal para posicionar, não há cursor para perder.
 */
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
    <input
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={formatCents(value || '0')}
      onChange={(event) => onValueChange(digitsToCents(event.target.value))}
      className="h-11 w-full rounded-sm border border-border bg-surface-elevated px-3 font-mono tabular-mono text-foreground"
    />
  );
}
