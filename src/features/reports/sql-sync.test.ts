import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SQL_DIR = join(__dirname, 'sql');
const QUERIES_SOURCE = readFileSync(join(__dirname, 'queries.ts'), 'utf8');

/** Normaliza espaço em branco pra comparar SQL "de forma", não caractere a caractere
 *  (indentação do arquivo .sql e do template literal em queries.ts não precisam bater). */
function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

const SQL_FILES = ['customer-pnl.sql', 'monthly-summary.sql', 'supplier-breakdown.sql', 'plan-breakdown.sql', 'customer-breakdown.sql'];

describe('sincronização dos .sql de referência com queries.ts', () => {
  it.each(SQL_FILES)('%s: cada statement aparece em queries.ts', (filename) => {
    const fileContent = readFileSync(join(SQL_DIR, filename), 'utf8');
    // Statements separados por ';' no arquivo de referência (remove comentários de linha antes de comparar).
    const statements = fileContent
      .split(';')
      .map((s) => s.replace(/--.*$/gm, '').trim())
      .filter(Boolean);

    for (const statement of statements) {
      const normalizedStatement = normalize(statement);
      const normalizedSource = normalize(QUERIES_SOURCE);
      expect(normalizedSource, `Statement de ${filename} não encontrado (ou divergente) em queries.ts:\n${statement}`).toContain(normalizedStatement);
    }
  });
});
