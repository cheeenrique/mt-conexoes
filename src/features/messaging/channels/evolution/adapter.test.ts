import { afterEach, describe, expect, it, vi } from 'vitest';
import { evolutionAdapter } from './adapter';

const CREDENTIALS = { baseUrl: 'https://evo.cliente.com', apiKey: 'key', instanceName: 'principal' };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('evolutionAdapter.send', () => {
  it('envia texto livre e devolve o externalId', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ key: { id: 'EVO123' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await evolutionAdapter.send({ toPhone: '+5511999998888', body: 'Olá!' }, CREDENTIALS);

    expect(result).toEqual({ ok: true, externalId: 'EVO123' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://evo.cliente.com/message/sendText/principal');
    expect(init.headers.apikey).toBe('key');
    expect(JSON.parse(init.body)).toEqual({ number: '+5511999998888', text: 'Olá!' });
  });

  it('marca retryable=true quando o fetch rejeita (rede instável)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fetch failed')));

    const result = await evolutionAdapter.send({ toPhone: '+5511999998888', body: 'Olá!' }, CREDENTIALS);

    expect(result).toEqual({ ok: false, retryable: true, reason: 'fetch failed' });
  });

  it('marca retryable=false em número inválido (HTTP 400)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ message: 'número inválido' }),
    }));

    const result = await evolutionAdapter.send({ toPhone: 'x', body: 'Olá!' }, CREDENTIALS);

    expect(result).toEqual({ ok: false, retryable: false, reason: 'número inválido' });
  });
});

describe('evolutionAdapter.healthCheck', () => {
  it('ok só quando a instância está com state "open"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ instance: { state: 'open' } }) }));
    expect(await evolutionAdapter.healthCheck(CREDENTIALS)).toEqual({ ok: true });
  });

  it('falha quando a instância está desconectada', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ instance: { state: 'close' } }) }));
    expect(await evolutionAdapter.healthCheck(CREDENTIALS)).toEqual({ ok: false, reason: 'Instância Evolution desconectada (state: close).' });
  });

  it('resolve com ok=false quando o fetch rejeita (rede instável)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fetch failed')));

    const result = await evolutionAdapter.healthCheck(CREDENTIALS);

    expect(result).toEqual({ ok: false, reason: 'fetch failed' });
  });
});
