import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// O log é registro, nunca fonte de saldo: todo total sai de SUM sobre
// payments/charges. Somar por `financial_events` daria um número que parece
// certo e mente na primeira mutação que falhou no meio.
describe('financial_events fora do relatório', () => {
  it('nenhum SQL de relatório lê a tabela', () => {
    const dir = join(process.cwd(), 'src/features/reports/sql');
    const offenders = readdirSync(dir)
      .filter((file) => file.endsWith('.sql'))
      .filter((file) => readFileSync(join(dir, file), 'utf8').includes('financial_events'));

    expect(offenders).toEqual([]);
  });
});
