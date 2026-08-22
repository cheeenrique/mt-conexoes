import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import {
  applyPercent,
  divRoundHalfUp,
  marginPercent,
  classifySubscriptionMargin,
  classifyMarginTone,
  resolveAdjustedPriceCents,
  parseDecimalStringToCents,
} from './money';

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

describe('resolveAdjustedPriceCents', () => {
  it('cost increase raises price by the same delta', () => {
    expect(resolveAdjustedPriceCents(12_000n, 3_000n, 5_000n)).toBe(14_000n);
  });

  it('cost decrease lowers price by the same delta', () => {
    expect(resolveAdjustedPriceCents(12_000n, 5_000n, 3_000n)).toBe(10_000n);
  });

  it('a cost decrease larger than the old price clamps the new price to zero', () => {
    expect(resolveAdjustedPriceCents(1_000n, 50_000n, 500n)).toBe(0n);
  });
});

describe('classifyMarginTone', () => {
  it('40% é o piso da faixa saudável', () => {
    expect(classifyMarginTone(new Decimal('40'))).toBe('healthy');
    expect(classifyMarginTone(new Decimal('39.99'))).toBe('tight');
  });

  it('15% é o piso da faixa apertada', () => {
    expect(classifyMarginTone(new Decimal('15'))).toBe('tight');
    expect(classifyMarginTone(new Decimal('14.99'))).toBe('critical');
  });

  it('margem zerada é crítica', () => {
    expect(classifyMarginTone(new Decimal('0'))).toBe('critical');
  });

  it('margem negativa é crítica', () => {
    expect(classifyMarginTone(new Decimal('-0.01'))).toBe('critical');
    expect(classifyMarginTone(new Decimal('-100'))).toBe('critical');
  });

  it('margem acima de 100% continua saudável', () => {
    expect(classifyMarginTone(new Decimal('120'))).toBe('healthy');
  });

  it('sem receita não há faixa', () => {
    expect(classifyMarginTone(null)).toBeNull();
  });
});

describe('parseDecimalStringToCents', () => {
  // O `unmaskedValue` do imask usa sempre ponto como separador decimal, mesmo
  // com `radix: ','` configurado na máscara — é essa string que chega aqui.
  it('string vazia é zero', () => {
    expect(parseDecimalStringToCents('')).toBe('0');
  });

  it('zero é zero', () => {
    expect(parseDecimalStringToCents('0')).toBe('0');
  });

  it('inteiro sem parte fracionária multiplica por 100', () => {
    expect(parseDecimalStringToCents('10')).toBe('1000');
  });

  it('1 centavo', () => {
    expect(parseDecimalStringToCents('0.01')).toBe('1');
  });

  it('R$ 0,50 é 50 centavos, não 500', () => {
    expect(parseDecimalStringToCents('0.5')).toBe('50');
  });

  it('dízima: R$ 33,33', () => {
    expect(parseDecimalStringToCents('33.33')).toBe('3333');
  });

  it('R$ 1.234,56 digitado com milhar — o ponto de milhar já foi removido pelo imask antes de chegar aqui', () => {
    expect(parseDecimalStringToCents('1234.56')).toBe('123456');
  });

  it('parte inteira negativa preserva o sinal', () => {
    expect(parseDecimalStringToCents('-5')).toBe('-500');
    expect(parseDecimalStringToCents('-0.5')).toBe('-50');
  });

  it('mais de 2 casas decimais arredonda half up, uma vez, no fim', () => {
    expect(parseDecimalStringToCents('1.005')).toBe('101');
    expect(parseDecimalStringToCents('1.004')).toBe('100');
  });
});
