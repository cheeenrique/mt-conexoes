import { describe, expect, it } from 'vitest';
import { utils, write } from 'xlsx';
import { parseImportRow, readWorkbookRows } from './workbook';
import { buildFixtureWorkbook } from './__fixtures__/generate-fixture';

const TZ = 'America/Sao_Paulo';
const NOW = new Date('2026-08-20T12:00:00Z');

function twoSheetWorkbook(): Buffer {
  const workbook = utils.book_new();
  // Aba vazia PRIMEIRO — o arquivo real da UniPlay tem `Planilha1` vazia
  // depois de `IPTV`, mas a ordem não pode ser um pressuposto do parser.
  utils.book_append_sheet(workbook, utils.aoa_to_sheet([]), 'Planilha1');
  utils.book_append_sheet(workbook, utils.aoa_to_sheet([['CODIGO', 'VALOR'], ['Ana', 50]]), 'IPTV');
  return write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

describe('readWorkbookRows', () => {
  it('acha a aba com dado mesmo quando não é a primeira', () => {
    const rows = readWorkbookRows(twoSheetWorkbook());
    expect(rows).toEqual([{ CODIGO: 'Ana', VALOR: 50 }]);
  });

  it('devolve lista vazia quando todas as abas estão vazias', () => {
    const workbook = utils.book_new();
    utils.book_append_sheet(workbook, utils.aoa_to_sheet([]), 'Planilha1');
    const buffer = write(workbook, { type: 'buffer', bookType: 'xlsx' });
    expect(readWorkbookRows(buffer)).toEqual([]);
  });

  it('recusa com erro de domínio um arquivo ilegível, em vez de deixar o xlsx estourar cru', () => {
    // O parser do `xlsx` é bem tolerante (tenta CSV, HTML, binário legado...) —
    // texto aberto não basta pra estourar. Um ZIP com assinatura válida e
    // conteúdo corrompido força o parser real de `.xlsx` a falhar.
    const garbage = Buffer.from(`PK\x03\x04${'lixo, não é um zip de verdade'.repeat(5)}`);
    expect(() => readWorkbookRows(garbage)).toThrow('Não foi possível ler o arquivo');
  });

  it('lê célula-data como serial do Excel corretamente (arquivo real gerado pelo Excel)', () => {
    const buffer = buildFixtureWorkbook([{ CODIGO: 'Ana', VALIDADE: new Date('2026-08-10'), VALOR: '50,00' }]);
    const rows = readWorkbookRows(buffer);
    const parsed = parseImportRow(rows[0], TZ, NOW);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      // 23:59:59.999 de 10/08/2026 em America/Sao_Paulo (UTC-3) cai em 11/08 em UTC.
      expect(parsed.data.dueDate.toISOString()).toBe('2026-08-11T02:59:59.999Z');
    }
  });
});

describe('parseImportRow', () => {
  it('recusa nome ausente', () => {
    const result = parseImportRow({ CODIGO: '', VALIDADE: '10/08/2026', VALOR: '50,00' }, TZ, NOW);
    expect(result).toEqual({ ok: false, identifier: '(sem nome)', reason: 'Nome ausente.' });
  });

  it('recusa vencimento ausente', () => {
    const result = parseImportRow({ CODIGO: 'Ana', VALOR: '50,00' }, TZ, NOW);
    expect(result).toMatchObject({ ok: false, reason: 'Data de vencimento ausente ou inválida.' });
  });

  it('recusa valor ausente ou negativo', () => {
    const semValor = parseImportRow({ CODIGO: 'Ana', VALIDADE: '10/08/2026' }, TZ, NOW);
    expect(semValor).toMatchObject({ ok: false, reason: 'Valor do serviço ausente, inválido ou negativo.' });

    const negativo = parseImportRow({ CODIGO: 'Ana', VALIDADE: '10/08/2026', VALOR: -10 }, TZ, NOW);
    expect(negativo).toMatchObject({ ok: false, reason: 'Valor do serviço ausente, inválido ou negativo.' });
  });

  it('linha sem WHATSAPP entra sem telefone — ausência não é motivo de recusa', () => {
    const result = parseImportRow({ CODIGO: 'Ana', VALIDADE: '10/08/2026', VALOR: '50,00' }, TZ, NOW);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.phone).toBeNull();
      expect(result.data.phoneWasInvalid).toBe(false);
    }
  });

  it('telefone presente mas sem DDD entra sem telefone, com ressalva — não recusa a linha', () => {
    const result = parseImportRow({ CODIGO: 'Ana', VALIDADE: '10/08/2026', VALOR: '50,00', WHATSAPP: '9999-8888' }, TZ, NOW);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.phone).toBeNull();
      expect(result.data.phoneWasInvalid).toBe(true);
    }
  });

  it('cabeçalho com espaço sobrando (" VALOR ", "  WHATSAPP") é reconhecido', () => {
    const result = parseImportRow(
      { CODIGO: 'Ana', VALIDADE: '10/08/2026', ' VALOR ': '105', '  WHATSAPP': '(62) 99813-3401' },
      TZ,
      NOW,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.priceCents).toBe(10500n);
      expect(result.data.phone).toBe('+5562998133401');
    }
  });

  it('SENHA numérica vira string', () => {
    const result = parseImportRow({ CODIGO: 'Ana', VALIDADE: '10/08/2026', VALOR: '50,00', SENHA: 9939894 }, TZ, NOW);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.password).toBe('9939894');
  });

  it('CRIAÇÃO ausente usa `now` — nunca `new Date()` interno, senão o teste não seria determinístico', () => {
    const result = parseImportRow({ CODIGO: 'Ana', VALIDADE: '10/08/2026', VALOR: '50,00' }, TZ, NOW);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.startedAt).toEqual(NOW);
  });

  it('TELAS ausente assume 1', () => {
    const result = parseImportRow({ CODIGO: 'Ana', VALIDADE: '10/08/2026', VALOR: '50,00' }, TZ, NOW);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.screens).toBe(1);
  });
});
