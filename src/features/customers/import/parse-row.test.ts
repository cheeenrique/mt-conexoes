import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseCentsFromBR, parseDateBR, toBusinessDueDate } from './parse-row';

describe('parseCentsFromBR', () => {
  it('parseia "R$ 1.234,56"', () => {
    expect(parseCentsFromBR('R$ 1.234,56')).toBe(123456n);
  });

  it('parseia "1234,56" sem prefixo', () => {
    expect(parseCentsFromBR('1234,56')).toBe(123456n);
  });

  it('parseia "1234.56" (formato US, caso o Excel exporte assim)', () => {
    expect(parseCentsFromBR('1234.56')).toBe(123456n);
  });

  it('parseia número puro (célula numérica do Excel)', () => {
    expect(parseCentsFromBR(1234.56)).toBe(123456n);
  });

  it('rejeita valor negativo', () => {
    expect(parseCentsFromBR('-10,00')).toBeNull();
  });

  it('rejeita texto não numérico', () => {
    expect(parseCentsFromBR('grátis')).toBeNull();
  });
});

describe('parseDateBR', () => {
  it('parseia "07/08/2026"', () => {
    const date = parseDateBR('07/08/2026');
    expect(date?.toISOString().slice(0, 10)).toBe('2026-08-07');
  });

  it('aceita um objeto Date direto (xlsx já converteu célula formatada como data)', () => {
    const input = new Date('2026-08-07T12:00:00Z');
    expect(parseDateBR(input)).toBe(input);
  });

  it('rejeita string vazia', () => {
    expect(parseDateBR('')).toBeNull();
  });

  it('rejeita data impossível', () => {
    expect(parseDateBR('32/13/2026')).toBeNull();
  });
});

/**
 * Serial do Excel. A versão anterior recusava número cru de propósito, apostando
 * que o `xlsx` sempre entrega célula-data como `Date` — o que só vale quando a
 * célula carrega formato de data. Planilha em que VALIDADE é número puro fazia
 * TODA linha ser recusada com "Data de vencimento ausente ou inválida", culpando
 * o dado por uma limitação do parser. Encontrado em 25/08/2026 importando pela
 * tela.
 */
describe('parseDateBR — serial do Excel', () => {
  it('converte o serial de vencimento da planilha real', () => {
    // 46265 é o VALIDADE da primeira linha do arquivo do cliente; conferido
    // contra o que o xlsx decodifica com `cellDates: true` (2026-08-31).
    expect(parseDateBR(46265)).toEqual(new Date(Date.UTC(2026, 7, 31)));
  });

  it('converte o serial de criação da mesma linha', () => {
    expect(parseDateBR(46158)).toEqual(new Date(Date.UTC(2026, 4, 16)));
  });

  it('descarta a parte de hora, como faz o ramo de texto', () => {
    expect(parseDateBR(46265.5)).toEqual(new Date(Date.UTC(2026, 7, 31)));
  });

  it('recusa 29/02/1900, o dia que só existe dentro do Excel', () => {
    // Serial 60 é o bug de ano bissexto herdado do Lotus 1-2-3. Aceitar
    // silenciosamente viraria 01/03/1900.
    expect(parseDateBR(60)).toBeNull();
  });

  it('recusa zero e negativo', () => {
    expect(parseDateBR(0)).toBeNull();
    expect(parseDateBR(-5)).toBeNull();
  });

  it('recusa número que não é serial válido', () => {
    expect(parseDateBR(Number.NaN)).toBeNull();
    expect(parseDateBR(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('toBusinessDueDate', () => {
  const originalTz = process.env.TZ;

  beforeEach(() => {
    // Simula o processo Node do Cloud Run rodando em UTC — o bug corrigido
    // era sensível ao fuso do PROCESSO, não só ao dado. Sem isso, o teste
    // passaria mesmo com getters locais em vez de UTC, dependendo de onde
    // roda a suíte.
    process.env.TZ = 'UTC';
  });

  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it('ancora no fim do dia local do negócio, não em meia-noite UTC', () => {
    // Célula-data decodificada pelo xlsx pro dia 10/08/2026, como um Date de
    // meia-noite UTC — é exatamente o formato que `parseDateBR` devolve para
    // uma célula-data real.
    const cellDate = new Date(Date.UTC(2026, 7, 10));

    const result = toBusinessDueDate(cellDate, 'America/Sao_Paulo');

    // 23:59:59.999 de 10/08 em America/Sao_Paulo (UTC-3) vira 11/08 02:59:59.999 em UTC.
    // Sob o bug antigo (armazenar o Date cru), o valor gravado seria
    // 2026-08-10T00:00:00.000Z — um dia inteiro adiantado na exibição local.
    expect(result.toISOString()).toBe('2026-08-11T02:59:59.999Z');
  });
});
