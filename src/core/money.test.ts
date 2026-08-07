import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { applyPercent, divRoundHalfUp, marginPercent } from './money';

describe('divRoundHalfUp', () => {
  it('arredonda 5/2 para cima (half up)', () => {
    expect(divRoundHalfUp(5n, 2n)).toBe(3n);
  });

  it('divide exato sem arredondar', () => {
    expect(divRoundHalfUp(4n, 2n)).toBe(2n);
  });

  it('R$ 100,00 dividido em 3 partes soma exatamente R$ 100,00', () => {
    const total = 10_000n;
    const parts = [
      divRoundHalfUp(total, 3n),
      divRoundHalfUp(total, 3n),
      total - 2n * divRoundHalfUp(total, 3n),
    ];
    expect(parts.reduce((a, b) => a + b, 0n)).toBe(total);
  });
});

describe('applyPercent', () => {
  it('33,33% sobre 10000 centavos → 3333 centavos', () => {
    expect(applyPercent(10_000n, new Decimal('33.33'))).toBe(3333n);
  });

  it('50% sobre 1 centavo → 1 centavo (half up)', () => {
    expect(applyPercent(1n, new Decimal('50'))).toBe(1n);
  });
});

describe('marginPercent', () => {
  it('devolve null quando receita é zero, não divide por zero', () => {
    expect(marginPercent(0n, 0n)).toBeNull();
  });

  it('calcula margem em pontos percentuais', () => {
    const margin = marginPercent(10_000n, 6_000n)!;
    expect(margin.toNumber()).toBeCloseTo(40, 5);
  });
});
