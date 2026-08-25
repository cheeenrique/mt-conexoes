'use client';

import { appendDigit, digitsToCents, dropLastDigit } from '@/core/money';
import { formatCents } from '@/lib/format';

/**
 * Campo de dinheiro. Trabalha em centavos na entrada e na saída — `value` e
 * `onValueChange` são sempre string de centavos, nunca `number`.
 *
 * ⚠️ É um **acumulador de centavos**, não um campo decimal: o dígito digitado
 * entra pela direita, como numa maquininha. Digitar `1`,`2`,`3`,`4` num campo
 * zerado dá `R$ 12,34`.
 *
 * Duas versões já quebraram aqui, pela mesma raiz — tratar o campo como texto:
 *
 * 1. `IMaskInput` controlado **perdia dígito**: o valor voltava do estado do pai
 *    num formato diferente do que a máscara exibia, a máscara reescrevia o campo,
 *    o cursor ia para o fim e o dígito seguinte caía depois da vírgula.
 * 2. Ler os dígitos de `event.target.value` no `onChange` **multiplicava o
 *    valor** quando o cursor não estava no fim: com o cursor no início de
 *    `R$ 0,00`, digitar `7` dava `R$ 70,00`, e digitar `1250` dava
 *    `R$ 10.002,50`. O `0,00` já exibido entrava na conta como escala.
 *
 * A correção é não editar string nenhuma: a tecla é um evento sobre o número.
 * `onKeyDown` trata dígito e apagar; qualquer outra tecla de edição é barrada,
 * porque num acumulador ela não significa nada. Colar continua funcionando pelo
 * `onChange`, que aí sim lê a string inteira — é o único caso em que ela é a
 * intenção do operador.
 */
const EDITING_KEYS_TO_IGNORE = new Set([
  'Home',
  'End',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Delete',
]);

export function CurrencyInput({
  value,
  onValueChange,
  id,
}: {
  value: string; // centavos, como string
  onValueChange: (cents: string) => void;
  id?: string;
}) {
  const cents = value || '0';

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    if (/^\d$/.test(event.key)) {
      event.preventDefault();
      onValueChange(appendDigit(cents, event.key));
      return;
    }

    if (event.key === 'Backspace') {
      event.preventDefault();
      onValueChange(dropLastDigit(cents));
      return;
    }

    if (EDITING_KEYS_TO_IGNORE.has(event.key)) {
      event.preventDefault();
    }
  }

  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={formatCents(cents)}
      onKeyDown={handleKeyDown}
      onChange={(event) => onValueChange(digitsToCents(event.target.value))}
      className="h-11 w-full rounded-sm border border-border bg-surface-elevated px-3 font-mono tabular-mono text-foreground"
    />
  );
}
