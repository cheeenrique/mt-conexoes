import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import {
  applyPercent,
  divRoundHalfUp,
  marginPercent,
  classifySubscriptionMargin,
  classifyMarginTone,
  resolveAdjustedPriceCents,
  digitsToCents,
  CURRENCY_MAX_DIGITS,
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

describe('digitsToCents', () => {
  // O campo de dinheiro é acumulador de centavos: o que o operador digita são os
  // dígitos que ele vê na tela, da direita para a esquerda. Digitar 1,2,3,4 tem
  // que dar R$ 12,34 — o bug que motivou esta função parava em R$ 1,00.
  it('acumula dígito a dígito da direita para a esquerda', () => {
    expect(digitsToCents('1')).toBe('1');
    expect(digitsToCents('12')).toBe('12');
    expect(digitsToCents('123')).toBe('123');
    expect(digitsToCents('1234')).toBe('1234');
  });

  it('ignora tudo que não é dígito — prefixo, milhar e vírgula da máscara', () => {
    expect(digitsToCents('R$ 12,34')).toBe('1234');
    expect(digitsToCents('R$ 1.234,56')).toBe('123456');
  });

  it('campo vazio é zero, não NaN', () => {
    expect(digitsToCents('')).toBe('0');
    expect(digitsToCents('R$ ,')).toBe('0');
  });

  it('1 centavo não vira 1 real', () => {
    expect(digitsToCents('R$ 0,01')).toBe('1');
  });

  it('zeros à esquerda não entram no valor', () => {
    expect(digitsToCents('000123')).toBe('123');
    expect(digitsToCents('0000')).toBe('0');
  });

  it('trunca acima do teto de dígitos em vez de crescer sem limite', () => {
    const acima = '9'.repeat(CURRENCY_MAX_DIGITS + 3);
    expect(digitsToCents(acima)).toBe('9'.repeat(CURRENCY_MAX_DIGITS));
  });

  it('nunca devolve negativo — o campo não tem sinal', () => {
    expect(digitsToCents('-500')).toBe('500');
  });
});
