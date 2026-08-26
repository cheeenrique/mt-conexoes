import { describe, expect, it } from 'vitest';
import { parseImportRow } from './workbook';
import { buildImportPlan } from './plan';

const TZ = 'America/Sao_Paulo';
const NOW = new Date('2026-08-20T12:00:00Z');

function parse(row: Record<string, unknown>) {
  return parseImportRow(row, TZ, NOW);
}

describe('buildImportPlan', () => {
  it('linha nova (usuário fora da lista de existentes) entra em toImport', () => {
    const parsed = [parse({ CODIGO: 'Maria', USUARIO: 'maria.nova', VALIDADE: '10/08/2026', VALOR: '50,00' })];

    const plan = buildImportPlan({ parsedRows: parsed, existingUsernames: new Set() });

    expect(plan.toImport).toHaveLength(1);
    expect(plan.toImport[0]).toMatchObject({ identifier: 'Maria', username: 'maria.nova' });
    expect(plan.alreadyExists).toHaveLength(0);
    expect(plan.rejected).toHaveLength(0);
  });

  it('linha cujo usuário já existe naquele fornecedor entra em alreadyExists, não em toImport', () => {
    const parsed = [parse({ CODIGO: 'João', USUARIO: 'joao.existente', VALIDADE: '10/08/2026', VALOR: '30,00' })];

    const plan = buildImportPlan({ parsedRows: parsed, existingUsernames: new Set(['joao.existente']) });

    expect(plan.alreadyExists).toHaveLength(1);
    expect(plan.toImport).toHaveLength(0);
    expect(plan.importTotalCents).toBe(0n);
  });

  it('linha recusada carrega o motivo e não entra em nenhum outro balde', () => {
    const parsed = [parse({ CODIGO: '', VALIDADE: '10/08/2026', VALOR: '50,00' })];

    const plan = buildImportPlan({ parsedRows: parsed, existingUsernames: new Set() });

    expect(plan.rejected).toEqual([{ identifier: '(sem nome)', reason: 'Nome ausente.' }]);
    expect(plan.toImport).toHaveLength(0);
    expect(plan.alreadyExists).toHaveLength(0);
  });

  it('telefone que não deu pra normalizar vira ressalva, mas a linha continua indo pra toImport', () => {
    const parsed = [
      parse({ CODIGO: 'Sem Telefone Válido', WHATSAPP: 'abc123', VALIDADE: '10/08/2026', VALOR: '50,00' }),
    ];

    const plan = buildImportPlan({ parsedRows: parsed, existingUsernames: new Set() });

    expect(plan.toImport).toHaveLength(1);
    expect(plan.toImport[0]?.hasPhoneWarning).toBe(true);
  });

  it('planilha vazia devolve plano zerado, sem margem', () => {
    const plan = buildImportPlan({ parsedRows: [], existingUsernames: new Set() });

    expect(plan).toMatchObject({
      totalRows: 0,
      toImport: [],
      alreadyExists: [],
      rejected: [],
      importTotalCents: 0n,
      averageMarginPercent: null,
    });
  });

  it('soma o valor de toImport e tira a média das margens', () => {
    const parsed = [
      parse({ CODIGO: 'A', USUARIO: 'a', VALIDADE: '10/08/2026', VALOR: '100,00', CUSTO: '50,00' }), // margem 50%
      parse({ CODIGO: 'B', USUARIO: 'b', VALIDADE: '10/08/2026', VALOR: '200,00', CUSTO: '150,00' }), // margem 25%
    ];

    const plan = buildImportPlan({ parsedRows: parsed, existingUsernames: new Set() });

    expect(plan.importTotalCents).toBe(30000n);
    expect(plan.averageMarginPercent?.toNumber()).toBeCloseTo(37.5, 5);
  });
});
