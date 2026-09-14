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

/**
 * Offset do degrau de recuperação — o último `SEND_MESSAGE` da escada, que o motor
 * casa por "a partir de" em vez de dia exato (`core/dunning-rules.ts`,
 * `selectStepsForCharge`). `null` numa régua sem degrau de mensagem.
 *
 * Existe para a tela poder dizer a verdade: o eixo mostrando "D+3" num degrau que na
 * prática pega quem está há 30 dias vencido é a tela mentindo sobre o motor — e é
 * exatamente o tipo de divergência que este módulo foi criado para evitar.
 *
 * A regra de quem é o degrau vive em `core/`; aqui só se repete o critério de
 * seleção para a apresentação, sem duplicar a decisão de casamento.
 */
export function catchUpOffset(steps: { offsetDays: number; action: string }[]): number | null {
  const messageOffsets = steps.filter((s) => s.action === 'SEND_MESSAGE').map((s) => s.offsetDays);
  return messageOffsets.length > 0 ? Math.max(...messageOffsets) : null;
}
