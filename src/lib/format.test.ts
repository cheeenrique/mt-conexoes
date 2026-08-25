import { describe, expect, it } from 'vitest';
import {
  formatCents,
  formatLocalDayMonth,
  formatLocalMonthYear,
  formatLocalTime,
  formatPercent,
  formatPhoneBR,
  whatsAppUrl,
} from './format';
import Decimal from 'decimal.js';

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

describe('formatPercent', () => {
  it('usa vírgula como separador decimal, não ponto', () => {
    // Bug encontrado no navegador em 25/08/2026: a margem aparecia como
    // `74.9%` numa UI toda em pt-BR, porque 12 lugares chamavam `toFixed`
    // direto em vez de um formatador.
    expect(formatPercent(74.9, 1)).toBe('74,9%');
  });

  it('sem casa decimal por padrão', () => {
    expect(formatPercent(58.4)).toBe('58%');
    expect(formatPercent(58.6)).toBe('59%');
  });

  it('aceita Decimal, string e number — as três formas que os sites usam', () => {
    expect(formatPercent(new Decimal('59.75'), 1)).toBe('59,8%');
    expect(formatPercent('59.75', 1)).toBe('59,8%');
    expect(formatPercent(59.75, 1)).toBe('59,8%');
  });

  it('null vira travessão, que é o que as telas já mostram', () => {
    expect(formatPercent(null)).toBe('—');
  });

  it('zero e negativo não viram travessão', () => {
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(-12.5, 1)).toBe('-12,5%');
  });
});
