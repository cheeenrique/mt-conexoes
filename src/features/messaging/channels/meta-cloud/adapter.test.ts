import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { metaCloudAdapter } from './adapter';
import { ChannelCredentialsInvalidError } from '../types';

const CREDENTIALS = { accessToken: 'tok', phoneNumberId: '123', wabaId: '456', appSecret: 'segredo-teste' };
const WEBHOOK_CREDENTIALS = CREDENTIALS;

function signBody(body: string, secret: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
}

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
    ).rejects.toThrow(ChannelCredentialsInvalidError);
  });

  it('marca retryable=false quando o corpo de sucesso vem em formato inesperado', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) }));

    const result = await metaCloudAdapter.send(
      { toPhone: '+5511999998888', body: '', templateRef: { name: 'x' } },
      CREDENTIALS,
    );

    expect(result).toEqual({ ok: false, retryable: false, reason: 'Resposta inesperada da Meta Cloud API.' });
  });

  it('marca retryable=true quando o fetch rejeita (rede instável)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fetch failed')));

    const result = await metaCloudAdapter.send(
      { toPhone: '+5511999998888', body: '', templateRef: { name: 'x' } },
      CREDENTIALS,
    );

    expect(result).toEqual({ ok: false, retryable: true, reason: 'Não foi possível alcançar a Meta Cloud API. Tente de novo em instantes.' });
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

  it('devolve ok=false quando o fetch rejeita (rede instável)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fetch failed')));
    expect(await metaCloudAdapter.healthCheck(CREDENTIALS)).toEqual({ ok: false, reason: 'Não foi possível alcançar a Meta Cloud API. Tente de novo em instantes.' });
  });
});

describe('metaCloudAdapter.verifyWebhookSignature', () => {
  it('aceita assinatura correta', () => {
    const body = '{"entry":[]}';
    const headers = new Headers({ 'x-hub-signature-256': signBody(body, 'segredo-teste') });
    expect(metaCloudAdapter.verifyWebhookSignature(body, headers, WEBHOOK_CREDENTIALS)).toBe(true);
  });

  it('rejeita assinatura errada', () => {
    const body = '{"entry":[]}';
    const headers = new Headers({ 'x-hub-signature-256': signBody(body, 'segredo-errado') });
    expect(metaCloudAdapter.verifyWebhookSignature(body, headers, WEBHOOK_CREDENTIALS)).toBe(false);
  });

  it('rejeita header ausente', () => {
    const headers = new Headers();
    expect(metaCloudAdapter.verifyWebhookSignature('{}', headers, WEBHOOK_CREDENTIALS)).toBe(false);
  });
});

describe('metaCloudAdapter.parseInboundWebhook', () => {
  it('extrai telefone e texto de um payload de mensagem', () => {
    const payload = JSON.stringify({
      entry: [{ changes: [{ value: { messages: [{ from: '5511999998888', text: { body: 'PARE' } }] } }] }],
    });
    expect(metaCloudAdapter.parseInboundWebhook(payload)).toEqual([{ fromPhone: '5511999998888', text: 'PARE' }]);
  });

  it('ignora payload de delivery receipt (statuses, sem messages)', () => {
    const payload = JSON.stringify({
      entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.x', status: 'delivered' }] } }] }],
    });
    expect(metaCloudAdapter.parseInboundWebhook(payload)).toBeNull();
  });

  it('payload malformado (JSON inválido) retorna null, não lança', () => {
    expect(metaCloudAdapter.parseInboundWebhook('not json')).toBeNull();
  });

  it('entry com tipo errado (não-array) retorna null, não lança', () => {
    expect(metaCloudAdapter.parseInboundWebhook('{"entry": 5}')).toBeNull();
  });

  it('changes com tipo errado (não-array) retorna null, não lança', () => {
    expect(metaCloudAdapter.parseInboundWebhook('{"entry":[{"changes":"x"}]}')).toBeNull();
  });

  it('messages com tipo errado (não-array) retorna null, não lança', () => {
    expect(
      metaCloudAdapter.parseInboundWebhook('{"entry":[{"changes":[{"value":{"messages":5}}]}]}'),
    ).toBeNull();
  });
});
