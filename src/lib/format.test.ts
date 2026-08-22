import { describe, expect, it } from 'vitest';
import {
  centsToDecimalString,
  formatCents,
  formatLocalDayMonth,
  formatLocalMonthYear,
  formatLocalTime,
  formatPhoneBR,
  whatsAppUrl,
} from './format';

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

describe('formatPhoneBR', () => {
  it('formata celular de 11 dígitos', () => {
    expect(formatPhoneBR('+5562991802244')).toBe('(62) 99180-2244');
  });

  it('formata fixo de 10 dígitos', () => {
    expect(formatPhoneBR('+556232221100')).toBe('(62) 3222-1100');
  });

  it('aceita o número sem o "+"', () => {
    expect(formatPhoneBR('5562991802244')).toBe('(62) 99180-2244');
  });

  // Base importada de planilha tem número torto. Mostrar o valor cru é melhor
  // que mostrar "(62) 9918-02" — o operador precisa reconhecer o que está lá.
  it('devolve o valor original quando não é um número brasileiro reconhecível', () => {
    expect(formatPhoneBR('+13105551234')).toBe('+13105551234');
    expect(formatPhoneBR('')).toBe('');
  });
});

describe('whatsAppUrl', () => {
  it('monta o link com o número em dígitos, sem duplicar o 55', () => {
    expect(whatsAppUrl('+5562991802244')).toBe('https://wa.me/5562991802244');
  });

  it('prefixa 55 quando o número guardado veio sem o país', () => {
    expect(whatsAppUrl('62991802244')).toBe('https://wa.me/5562991802244');
  });
});

describe('formatação local de data e hora', () => {
  const TZ = 'America/Sao_Paulo';

  it('mostra a hora no fuso do negócio, não em UTC', () => {
    expect(formatLocalTime('2026-08-22T02:00:00Z', TZ)).toBe('23:00');
  });

  it('mês e ano saem do dia local — 01/08 às 00:30 UTC ainda é 07/2026', () => {
    expect(formatLocalMonthYear('2026-08-01T00:30:00Z', TZ)).toBe('07/2026');
  });

  it('dia e mês curtos para a coluna de vencimento', () => {
    expect(formatLocalDayMonth('2026-08-22T23:59:59-03:00', TZ)).toBe('22/08');
  });
});

describe('centsToDecimalString', () => {
  // Sem separador de milhar de propósito: é o valor inicial que o CurrencyInput
  // entrega ao IMaskInput, que aplica seu próprio agrupamento na exibição.
  it('formata zero', () => {
    expect(centsToDecimalString('0')).toBe('0,00');
  });

  it('1 centavo', () => {
    expect(centsToDecimalString('1')).toBe('0,01');
  });

  it('sem separador de milhar, só o decimal com vírgula', () => {
    expect(centsToDecimalString('123456')).toBe('1234,56');
  });

  it('valor negativo mantém o sinal', () => {
    expect(centsToDecimalString('-500')).toBe('-5,00');
  });

  it('ida e volta com parseDecimalStringToCents fecha exatamente para uma dízima', () => {
    expect(centsToDecimalString('3333')).toBe('33,33');
  });
});
