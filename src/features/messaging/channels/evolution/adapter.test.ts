import { afterEach, describe, expect, it, vi } from 'vitest';
import { evolutionAdapter } from './adapter';
import { ChannelCredentialsInvalidError } from '../types';

const CREDENTIALS = {
  baseUrl: 'https://evo.cliente.com',
  apiKey: 'key',
  instanceName: 'principal',
  webhookToken: 'token-teste',
};

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

  it('marca retryable=false quando o corpo de sucesso vem em formato inesperado', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) }));

    const result = await evolutionAdapter.send({ toPhone: '+5511999998888', body: 'Olá!' }, CREDENTIALS);

    expect(result).toEqual({ ok: false, retryable: false, reason: 'Resposta inesperada do Evolution.' });
  });

  it('rejeita credencial com forma inválida', async () => {
    await expect(
      evolutionAdapter.send({ toPhone: '+5511999998888', body: 'Olá!' }, { baseUrl: '' }),
    ).rejects.toThrow(ChannelCredentialsInvalidError);
  });
});

describe('evolutionAdapter.verifyWebhookSignature', () => {
  it('aceita quando o header apikey bate com webhookToken', () => {
    const headers = new Headers({ apikey: 'token-teste' });
    expect(evolutionAdapter.verifyWebhookSignature('{}', headers, CREDENTIALS)).toBe(true);
  });

  it('rejeita token errado ou ausente', () => {
    expect(evolutionAdapter.verifyWebhookSignature('{}', new Headers({ apikey: 'errado' }), CREDENTIALS)).toBe(false);
    expect(evolutionAdapter.verifyWebhookSignature('{}', new Headers(), CREDENTIALS)).toBe(false);
  });

  it('rejeita token do mesmo tamanho mas com conteúdo diferente (exercita o ramo timingSafeEqual)', () => {
    // 'token-teste' tem 11 chars — mesma contagem, conteúdo diferente.
    expect(evolutionAdapter.verifyWebhookSignature('{}', new Headers({ apikey: 'errado-teste'.slice(0, 11) }), CREDENTIALS)).toBe(false);
  });

  it('T5: o apikey que a Evolution manda sozinha no CORPO nunca autentica — é o token interno da instância, não o webhookToken', () => {
    // Confirmado rodando a stack local (tag 2.3.7): o corpo de todo evento carrega
    // `apikey` = token da instância (POST /instance/create → `hash`), nunca o valor que
    // o operador escolhe aqui. Um payload que "convenientemente" repete o webhookToken
    // certo no corpo, sem o header, ainda tem que ser recusado — a fonte de verdade é
    // só o header, configurado via `webhook.headers.apikey` na instância.
    const bodyWithCorrectTokenButNoHeader = JSON.stringify({ event: 'messages.upsert', apikey: CREDENTIALS.webhookToken, data: {} });
    expect(evolutionAdapter.verifyWebhookSignature(bodyWithCorrectTokenButNoHeader, new Headers(), CREDENTIALS)).toBe(false);
  });
});

describe('evolutionAdapter.parseConnectionEvent', () => {
  it('extrai state "close" de connection.update — sessão caiu', () => {
    const payload = JSON.stringify({ event: 'connection.update', instance: 'principal', data: { instance: 'principal', state: 'close', statusReason: 401 } });
    expect(evolutionAdapter.parseConnectionEvent!(payload)).toEqual({ state: 'close' });
  });

  it('extrai state "open" — sessão conectada', () => {
    const payload = JSON.stringify({ event: 'connection.update', data: { state: 'open' } });
    expect(evolutionAdapter.parseConnectionEvent!(payload)).toEqual({ state: 'open' });
  });

  it('extrai state "connecting" — reconexão em andamento, nem queda nem volta confirmada', () => {
    const payload = JSON.stringify({ event: 'connection.update', data: { state: 'connecting' } });
    expect(evolutionAdapter.parseConnectionEvent!(payload)).toEqual({ state: 'connecting' });
  });

  it('extrai o número do wuid quando o aparelho conecta — é o remetente que a tela mostra', () => {
    // Forma real do evento de `open` na tag 2.3.7: o `wuid` entra junto com o state.
    const payload = JSON.stringify({
      event: 'connection.update',
      data: {
        instance: 'painel-a1b2c3',
        wuid: '5565999998888@s.whatsapp.net',
        profileName: 'MT Conexões',
        state: 'open',
        statusReason: 200,
      },
    });
    expect(evolutionAdapter.parseConnectionEvent!(payload)).toEqual({ state: 'open', phone: '+5565999998888' });
  });

  it('ignora evento que não é connection.update (ex.: messages.upsert)', () => {
    const payload = JSON.stringify({ event: 'messages.upsert', data: { key: {}, message: {} } });
    expect(evolutionAdapter.parseConnectionEvent!(payload)).toBeNull();
  });

  it('payload malformado ou com state desconhecido retorna null, não lança', () => {
    expect(evolutionAdapter.parseConnectionEvent!('not json')).toBeNull();
    expect(evolutionAdapter.parseConnectionEvent!(JSON.stringify({ event: 'connection.update' }))).toBeNull();
    expect(evolutionAdapter.parseConnectionEvent!(JSON.stringify({ event: 'connection.update', data: null }))).toBeNull();
    expect(evolutionAdapter.parseConnectionEvent!(JSON.stringify({ event: 'connection.update', data: { state: 'banido' } }))).toBeNull();
  });
});

describe('evolutionAdapter.parseInboundWebhook', () => {
  it('extrai telefone e texto de messages.upsert', () => {
    const payload = JSON.stringify({
      event: 'messages.upsert',
      data: { key: { remoteJid: '5511999998888@s.whatsapp.net', fromMe: false }, message: { conversation: 'PARE' } },
    });
    expect(evolutionAdapter.parseInboundWebhook(payload)).toEqual([{ fromPhone: '5511999998888', text: 'PARE' }]);
  });

  it('ignora mensagem eco (fromMe: true)', () => {
    const payload = JSON.stringify({
      event: 'messages.upsert',
      data: { key: { remoteJid: '5511999998888@s.whatsapp.net', fromMe: true }, message: { conversation: 'oi' } },
    });
    expect(evolutionAdapter.parseInboundWebhook(payload)).toBeNull();
  });

  it('payload malformado retorna null, não lança', () => {
    expect(evolutionAdapter.parseInboundWebhook('not json')).toBeNull();
  });

  it('payload com formato inesperado retorna null, não lança', () => {
    expect(evolutionAdapter.parseInboundWebhook(JSON.stringify({ event: 'messages.upsert' }))).toBeNull();
    expect(evolutionAdapter.parseInboundWebhook(JSON.stringify({ data: null }))).toBeNull();
    expect(evolutionAdapter.parseInboundWebhook(JSON.stringify({ data: { key: 'not-an-object' } }))).toBeNull();
    expect(
      evolutionAdapter.parseInboundWebhook(JSON.stringify({ data: { key: { remoteJid: 123, fromMe: false } } })),
    ).toBeNull();
    expect(
      evolutionAdapter.parseInboundWebhook(
        JSON.stringify({ data: { key: { remoteJid: '5511999998888@s.whatsapp.net', fromMe: false }, message: 'not-an-object' } }),
      ),
    ).toBeNull();
    expect(
      evolutionAdapter.parseInboundWebhook(
        JSON.stringify({
          data: {
            key: { remoteJid: '5511999998888@s.whatsapp.net', fromMe: false },
            message: { conversation: 42 },
          },
        }),
      ),
    ).toBeNull();
    expect(evolutionAdapter.parseInboundWebhook(JSON.stringify('not-an-object'))).toBeNull();
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
