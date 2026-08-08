import { afterEach, describe, expect, it, vi } from 'vitest';
import { metaCloudAdapter } from './adapter';

const CREDENTIALS = { accessToken: 'tok', phoneNumberId: '123', wabaId: '456' };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('metaCloudAdapter.send', () => {
  it('envia template e devolve o externalId em caso de sucesso', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ messages: [{ id: 'wamid.123' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await metaCloudAdapter.send(
      { toPhone: '+5511999998888', body: '', templateRef: { name: 'renovacao_hoje', params: { '1': 'João' } } },
      CREDENTIALS,
    );

    expect(result).toEqual({ ok: true, externalId: 'wamid.123' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('123/messages');
    expect(init.headers.Authorization).toBe('Bearer tok');
    const body = JSON.parse(init.body);
    expect(body.type).toBe('template');
    expect(body.template.name).toBe('renovacao_hoje');
  });

  it('marca retryable=true em erro de rate limit (HTTP 429)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: { message: 'rate limited', code: 80007 } }),
    }));

    const result = await metaCloudAdapter.send(
      { toPhone: '+5511999998888', body: '', templateRef: { name: 'x' } },
      CREDENTIALS,
    );

    expect(result).toEqual({ ok: false, retryable: true, reason: 'rate limited' });
  });

  it('marca retryable=false em template rejeitado (HTTP 400)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'template não aprovado', code: 132001 } }),
    }));

    const result = await metaCloudAdapter.send(
      { toPhone: '+5511999998888', body: '', templateRef: { name: 'x' } },
      CREDENTIALS,
    );

    expect(result).toEqual({ ok: false, retryable: false, reason: 'template não aprovado' });
  });

  it('rejeita credencial com forma inválida', async () => {
    await expect(
      metaCloudAdapter.send({ toPhone: '+5511999998888', body: '' }, { accessToken: '' }),
    ).rejects.toThrow();
  });
});

describe('metaCloudAdapter.healthCheck', () => {
  it('ok quando o phone number id responde', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: '123' }) }));
    expect(await metaCloudAdapter.healthCheck(CREDENTIALS)).toEqual({ ok: true });
  });

  it('falha quando o token é inválido', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'Invalid OAuth access token' } }),
    }));
    expect(await metaCloudAdapter.healthCheck(CREDENTIALS)).toEqual({ ok: false, reason: 'Invalid OAuth access token' });
  });
});
