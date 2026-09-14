import { describe, expect, it } from 'vitest';
import { catchUpOffset, daysOf, directionOf, offsetDaysFrom, stepLabel } from './step-offset';

describe('offsetDaysFrom', () => {
  it('antes do vencimento vira deslocamento negativo', () => {
    expect(offsetDaysFrom(5, 'before')).toBe(-5);
  });

  it('depois do vencimento vira deslocamento positivo', () => {
    expect(offsetDaysFrom(3, 'after')).toBe(3);
  });

  it('zero dias é o próprio dia do vencimento, dê qual lado for', () => {
    expect(offsetDaysFrom(0, 'before')).toBe(0);
    expect(offsetDaysFrom(0, 'after')).toBe(0);
  });
});

describe('ida e volta', () => {
  it('reabrir o passo devolve os mesmos dias e lado que foram salvos', () => {
    for (const offsetDays of [-5, -2, 0, 1, 3, 5]) {
      expect(offsetDaysFrom(daysOf(offsetDays), directionOf(offsetDays))).toBe(offsetDays);
    }
  });

  it('D0 reabre como "depois", que é o lado neutro do seletor', () => {
    expect(directionOf(0)).toBe('after');
    expect(daysOf(0)).toBe(0);
  });
});

describe('stepLabel', () => {
  it('formata o rótulo do eixo com o sinal explícito', () => {
    expect(stepLabel(-5)).toBe('D-5');
    expect(stepLabel(0)).toBe('D0');
    expect(stepLabel(3)).toBe('D+3');
  });
});

describe('catchUpOffset', () => {
  const STEPS = [
    { offsetDays: -2, action: 'SEND_MESSAGE' },
    { offsetDays: 0, action: 'SEND_MESSAGE' },
    { offsetDays: 3, action: 'SEND_MESSAGE' },
    { offsetDays: 5, action: 'SUSPEND' },
  ];

  it('é o último degrau de mensagem, não o de maior offset', () => {
    expect(catchUpOffset(STEPS)).toBe(3);
  });

  it('régua sem degrau de mensagem não tem degrau de recuperação', () => {
    expect(catchUpOffset([{ offsetDays: 5, action: 'SUSPEND' }])).toBeNull();
    expect(catchUpOffset([])).toBeNull();
  });
});
