import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { applyPercent, divRoundHalfUp, marginPercent, classifySubscriptionMargin } from './money';

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

describe('classifySubscriptionMargin', () => {
  it('price equal to cost is negative, not ok', () => {
    expect(classifySubscriptionMargin(5_000n, 5_000n, new Decimal('30'))).toBe('negative');
  });

  it('price below cost is negative', () => {
    expect(classifySubscriptionMargin(3_000n, 5_000n, new Decimal('30'))).toBe('negative');
  });

  it('zero price is negative, never divides by zero', () => {
    expect(classifySubscriptionMargin(0n, 0n, new Decimal('30'))).toBe('negative');
  });

  it('margin exactly at the threshold is ok, not below_threshold (strict less-than)', () => {
    // price 10000, cost 7000 → margin exactly 30%
    expect(classifySubscriptionMargin(10_000n, 7_000n, new Decimal('30'))).toBe('ok');
  });

  it('margin one point below the threshold is below_threshold', () => {
    // price 10000, cost 7100 → margin 29%
    expect(classifySubscriptionMargin(10_000n, 7_100n, new Decimal('30'))).toBe('below_threshold');
  });

  it('margin well above the threshold is ok', () => {
    expect(classifySubscriptionMargin(10_000n, 2_000n, new Decimal('30'))).toBe('ok');
  });
});
