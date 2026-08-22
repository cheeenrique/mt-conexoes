import type { StepDirection } from './schema';

/**
 * Conversão entre o deslocamento assinado gravado no banco (`offsetDays`) e o
 * par dias/lado que o operador digita e lê. Módulo puro dentro da feature —
 * mesmo padrão de `features/messaging/message-log-format.ts`.
 *
 * Uma única fonte para o sinal: o formulário, o eixo de passos e a lista de
 * revisão precisam concordar sobre o que "D-5" significa. Duas implementações
 * do sinal é o caminho para a tela dizer "5 dias antes" e o motor enfileirar
 * cinco dias depois.
 */

export function offsetDaysFrom(days: number, direction: StepDirection): number {
  // `-0` normalizado: D0 é o dia do vencimento, não existe "zero antes".
  if (days === 0) return 0;
  return direction === 'before' ? -days : days;
}

export function daysOf(offsetDays: number): number {
  return Math.abs(offsetDays);
}

export function directionOf(offsetDays: number): StepDirection {
  return offsetDays < 0 ? 'before' : 'after';
}

/** Rótulo mono do eixo: `D-5`, `D0`, `D+3`. */
export function stepLabel(offsetDays: number): string {
  if (offsetDays === 0) return 'D0';
  return offsetDays < 0 ? `D${offsetDays}` : `D+${offsetDays}`;
}
