import { afterEach, describe, expect, it, vi } from 'vitest';
import { salvyAdapter } from './adapter';
import { ChannelCredentialsInvalidError } from '../types';

const CREDENTIALS = { apiKey: 'salvy-key' };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('salvyAdapter.send', () => {
  it('envia texto livre e devolve o externalId', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'SALVY-1' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await salvyAdapter.send({ toPhone: '+5511999998888', body: 'Olá!' }, CREDENTIALS);

    expect(result).toEqual({ ok: true, externalId: 'SALVY-1' });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer salvy-key');
  });

  it('marca retryable=true em erro 5xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({ message: 'indisponível' }) }));
    const result = await salvyAdapter.send({ toPhone: '+5511999998888', body: 'Olá!' }, CREDENTIALS);
    expect(result).toEqual({ ok: false, retryable: true, reason: 'indisponível' });
  });

  it('marca retryable=false em erro 4xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 422, json: async () => ({ message: 'número inválido' }) }));
    const result = await salvyAdapter.send({ toPhone: 'x', body: 'Olá!' }, CREDENTIALS);
    expect(result).toEqual({ ok: false, retryable: false, reason: 'número inválido' });
  });

  it('marca retryable=true quando o fetch rejeita (rede instável)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fetch failed')));
    const result = await salvyAdapter.send({ toPhone: '+5511999998888', body: 'Olá!' }, CREDENTIALS);
    expect(result).toEqual({ ok: false, retryable: true, reason: 'fetch failed' });
  });

  it('marca retryable=false quando o corpo de sucesso vem em formato inesperado', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) }));

    const result = await salvyAdapter.send({ toPhone: '+5511999998888', body: 'Olá!' }, CREDENTIALS);

    expect(result).toEqual({ ok: false, retryable: false, reason: 'Resposta inesperada do Salvy.' });
  });

  it('rejeita credencial com forma inválida', async () => {
    await expect(
      salvyAdapter.send({ toPhone: '+5511999998888', body: 'Olá!' }, { apiKey: '' }),
    ).rejects.toThrow(ChannelCredentialsInvalidError);
  });
});

describe('salvyAdapter.healthCheck', () => {
  it('ok quando a api key é válida', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) }));
    expect(await salvyAdapter.healthCheck(CREDENTIALS)).toEqual({ ok: true });
  });

  it('falha quando a api key é inválida', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ message: 'chave inválida' }) }));
    expect(await salvyAdapter.healthCheck(CREDENTIALS)).toEqual({ ok: false, reason: 'chave inválida' });
  });

  it('resolve com ok=false quando o fetch rejeita (rede instável)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fetch failed')));
    const result = await salvyAdapter.healthCheck(CREDENTIALS);
    expect(result).toEqual({ ok: false, reason: 'fetch failed' });
  });
});
