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
  appendDigit,
  dropLastDigit,
  CURRENCY_MAX_DIGITS,
} from './money';
import { formatCents } from '@/lib/format';

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

describe('acumulador do campo de dinheiro', () => {
  describe('appendDigit', () => {
    it('empurra o dígito pela direita, como numa maquininha', () => {
      expect(appendDigit('0', '1')).toBe('1');
      expect(appendDigit('1', '2')).toBe('12');
      expect(appendDigit('12', '3')).toBe('123');
      expect(appendDigit('123', '4')).toBe('1234');
    });

    it('digitar 1,2,5,0 num campo zerado dá R$ 12,50', () => {
      const cents = ['1', '2', '5', '0'].reduce(appendDigit, '0');
      expect(cents).toBe('1250');
      expect(formatCents(cents)).toBe('R$ 12,50');
    });

    it('não deixa zero à esquerda virar dígito significativo', () => {
      expect(appendDigit('0', '0')).toBe('0');
      expect(appendDigit('0', '7')).toBe('7');
    });

    it('para no teto de dígitos em vez de crescer sem fim', () => {
      const cheio = '9'.repeat(CURRENCY_MAX_DIGITS);
      expect(appendDigit(cheio, '9')).toBe(cheio);
    });

    it('ignora o que não é dígito', () => {
      expect(appendDigit('12', ',')).toBe('12');
      expect(appendDigit('12', 'a')).toBe('12');
    });
  });

  describe('dropLastDigit', () => {
    it('apaga o dígito da direita', () => {
      expect(dropLastDigit('1250')).toBe('125');
      expect(dropLastDigit('125')).toBe('12');
      expect(dropLastDigit('1')).toBe('0');
    });

    it('apagar de um campo zerado continua zerado', () => {
      expect(dropLastDigit('0')).toBe('0');
    });
  });

  describe('o valor não depende de onde está o cursor', () => {
    // Bug encontrado no navegador em 25/08/2026: com o cursor no início de
    // `R$ 0,00`, digitar `7` gravava R$ 70,00 — o onChange lia os dígitos da
    // string inteira, e o `0,00` que já estava na tela virava escala.
    it('digitar 7 num campo zerado dá R$ 0,07, não R$ 70,00', () => {
      expect(formatCents(appendDigit('0', '7'))).toBe('R$ 0,07');
    });

    it('digitar 1,2,5,0 nunca produz R$ 10.002,50', () => {
      const cents = ['1', '2', '5', '0'].reduce(appendDigit, '0');
      expect(formatCents(cents)).not.toBe('R$ 10.002,50');
    });
  });
});
