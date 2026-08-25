import { describe, expect, it } from 'vitest';
import { checkHealth } from './check';

describe('checkHealth', () => {
  it('responde ok quando o banco responde', async () => {
    const result = await checkHealth(async () => undefined);
    expect(result).toEqual({ status: 'ok', httpStatus: 200 });
  });

  // Bug encontrado em 25/08/2026: a rota devolvia 200 sem tocar no banco. Com o
  // Postgres de dev parado havia 22h, `/api/health` seguia dizendo `ok` — no
  // Cloud Run isso mantém no balanceador uma instância que não atende ninguém.
  it('responde 503 quando o banco não responde', async () => {
    const result = await checkHealth(async () => {
      throw new Error('connection refused');
    });
    expect(result).toEqual({ status: 'degraded', httpStatus: 503 });
  });

  it('não vaza o erro do banco para o corpo da resposta', async () => {
    const result = await checkHealth(async () => {
      throw new Error('FATAL: password authentication failed for user "mtconexoes"');
    });
    expect(JSON.stringify(result)).not.toContain('password');
    expect(JSON.stringify(result)).not.toContain('mtconexoes');
  });
});
