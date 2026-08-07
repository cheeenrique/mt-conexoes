import { describe, expect, it } from 'vitest';
import { formatCents } from './format';

describe('formatCents', () => {
  it('formata centavos como moeda BRL', () => {
    expect(formatCents('123456')).toBe('R$ 1.234,56');
  });

  it('aceita bigint diretamente', () => {
    expect(formatCents(100n)).toBe('R$ 1,00');
  });

  it('formata zero', () => {
    expect(formatCents(0n)).toBe('R$ 0,00');
  });

  it('não perde precisão acima de Number.MAX_SAFE_INTEGER', () => {
    // reais = Number.MAX_SAFE_INTEGER centavos, +9 centavos de resto —
    // Number(cents) / 100 arredondaria por passar do limite seguro do float.
    const cents = 9_007_199_254_740_991n * 100n + 9n;
    expect(formatCents(cents)).toBe('R$ 9.007.199.254.740.991,09');
  });
});
