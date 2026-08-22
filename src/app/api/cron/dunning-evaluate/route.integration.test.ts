import { afterEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { POST } from './route';

// Roda a passada de verdade contra a régua padrão (singleton, compartilhado
// com outras suítes — ver `.claude/rules/06-testes.md` e a memória de
// antipadrões deste repo). Sem este reset, `lastRunAt` fica com um valor real
// que faz `evaluate.integration.test.ts` falhar ao afirmar "sem carimbo de
// passada" numa régua DRAFT, dependendo da ordem de execução dos arquivos.
afterEach(async () => {
  await db.dunningRule.updateMany({
    where: { isDefault: true },
    data: { lastRunAt: null, lastRunMessagesSent: null, lastRunPendingReview: null },
  });
});

describe('POST /api/cron/dunning-evaluate', () => {
  it('sem token válido devolve 401', async () => {
    const req = new Request('http://localhost/api/cron/dunning-evaluate', { method: 'POST' });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('com token válido roda e devolve o resumo', async () => {
    process.env.CRON_SECRET = process.env.CRON_SECRET ?? 'dev-cron-secret';
    const req = new Request('http://localhost/api/cron/dunning-evaluate', {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('queued');
    expect(body).toHaveProperty('skipped');
    expect(body).toHaveProperty('pendingReview');
    expect(body).toHaveProperty('suspended');
  });
});
