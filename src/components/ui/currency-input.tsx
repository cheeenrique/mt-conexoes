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
 *
 * 3. **Seleção era ignorada, e digitar por cima somava.** Selecionar o conteúdo
 *    e digitar é o gesto universal para trocar o valor de um campo; aqui a tecla
 *    virava mais um dígito à direita do que já estava lá. Campo em `R$ 30,00`,
 *    selecionar tudo e digitar `5000` dava `R$ 300.050,00`. Relatado em
 *    11/09/2026 por dois clientes de R$ 30,00/mês cadastrados em R$ 1.830,00 e
 *    R$ 750,00 — os dois exatamente cem vezes um valor plausível, que é o que
 *    duas teclas por cima de um valor existente produzem.
 *
 *    Qualquer seleção recomeça do zero, e não só a que cobre tudo: num
 *    acumulador não existe edição posicional (Home, End e setas são barradas
 *    logo abaixo), então seleção só pode significar "trocar isto".
 */
const EDITING_KEYS_TO_IGNORE = new Set(['Home', 'End', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);

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

    const { selectionStart, selectionEnd } = event.currentTarget;
    const hasSelection = selectionStart !== selectionEnd;

    if (/^\d$/.test(event.key)) {
      event.preventDefault();
      onValueChange(appendDigit(hasSelection ? '0' : cents, event.key));
      return;
    }

    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      onValueChange(hasSelection ? '0' : dropLastDigit(cents));
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
