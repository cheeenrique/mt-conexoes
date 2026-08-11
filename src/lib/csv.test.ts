import { describe, expect, it } from 'vitest';
import { escapeCsvCell, toCsv } from './csv';

describe('escapeCsvCell', () => {
  it('prefixa célula iniciada por =', () => {
    expect(escapeCsvCell('=SOMA(A1:A2)')).toBe("'=SOMA(A1:A2)");
  });

  it('prefixa célula iniciada por +, -, @', () => {
    expect(escapeCsvCell('+55')).toBe("'+55");
    expect(escapeCsvCell('-10')).toBe("'-10");
    expect(escapeCsvCell('@user')).toBe("'@user");
  });

  it('não mexe em célula normal', () => {
    expect(escapeCsvCell('João Silva')).toBe('João Silva');
    expect(escapeCsvCell('R$ 100,00')).toBe('R$ 100,00');
  });
});

describe('toCsv', () => {
  it('gera header + linhas separadas por vírgula, terminadas em CRLF', () => {
    const csv = toCsv(['Nome', 'Valor'], [['João', '100'], ['Maria', '200']]);
    expect(csv).toBe('Nome,Valor\r\nJoão,100\r\nMaria,200');
  });

  it('envolve em aspas célula com vírgula, dobrando aspas internas', () => {
    const csv = toCsv(['Nome'], [['Silva, João "Jota"']]);
    expect(csv).toBe('Nome\r\n"Silva, João ""Jota"""');
  });

  it('aplica escapeCsvCell antes de decidir sobre aspas', () => {
    const csv = toCsv(['Fórmula'], [['=A1,B2']]);
    expect(csv).toBe('Fórmula\r\n"\'=A1,B2"');
  });
});
