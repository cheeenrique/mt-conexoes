import { describe, expect, it } from 'vitest';
import { POST } from './route';

describe('POST /api/cron/charges-mark-overdue', () => {
  it('sem token válido devolve 401', async () => {
    const req = new Request('http://localhost/api/cron/charges-mark-overdue', { method: 'POST' });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('com token válido roda e devolve o resumo', async () => {
    process.env.CRON_SECRET = process.env.CRON_SECRET ?? 'dev-cron-secret';
    const req = new Request('http://localhost/api/cron/charges-mark-overdue', {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('checked');
    expect(body).toHaveProperty('updated');
    expect(body).toHaveProperty('failed');
  });
});
