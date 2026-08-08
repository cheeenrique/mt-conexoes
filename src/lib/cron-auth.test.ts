import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { assertCloudSchedulerToken } from './cron-auth';

describe('assertCloudSchedulerToken', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CRON_OIDC_AUDIENCE', 'https://app.example.com/api/cron/charges-mark-overdue');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejeita requisição sem header Authorization', async () => {
    const req = new Request('https://app.example.com/api/cron/charges-mark-overdue', { method: 'POST' });
    await expect(assertCloudSchedulerToken(req)).rejects.toThrow();
  });

  it('rejeita token malformado', async () => {
    const req = new Request('https://app.example.com/api/cron/charges-mark-overdue', {
      method: 'POST',
      headers: { authorization: 'Bearer token-invalido' },
    });
    await expect(assertCloudSchedulerToken(req)).rejects.toThrow();
  });

  it('em desenvolvimento, aceita o bearer token fixo CRON_SECRET (mesmo mecanismo do assertCronRequest)', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('CRON_SECRET', 'dev-cron-secret');
    const req = new Request('https://app.example.com/api/cron/charges-mark-overdue', {
      method: 'POST',
      headers: { authorization: 'Bearer dev-cron-secret' },
    });
    await expect(assertCloudSchedulerToken(req)).resolves.toBeUndefined();
  });
});
