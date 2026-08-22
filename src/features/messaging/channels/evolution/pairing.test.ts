import { afterEach, describe, expect, it, vi } from 'vitest';
import { evolutionPairing } from './pairing';
import { isPairable } from '../pairing';
import { evolutionAdapter } from './adapter';
import { metaCloudAdapter } from '../meta-cloud/adapter';
import { ChannelCredentialsInvalidError } from '../types';

const PAIRING_INPUT = { baseUrl: 'https://evo.exemplo.com', apiKey: 'chave', pairingNumber: '+5565999998888' };
const CREDENTIALS = {
  baseUrl: 'https://evo.exemplo.com',
  apiKey: 'chave',
  instanceName: 'painel-a1b2c3',
  webhookToken: 'token-do-webhook',
};
const OPTIONS = {
  instanceName: 'painel-a1b2c3',
  webhookToken: 'token-do-webhook',
  webhookUrl: 'https://painel.exemplo.com/api/webhooks/evolution',
};

/** Forma real do `POST /instance/create` da tag 2.3.7, conferida contra a stack local. */
const CREATE_RESPONSE = {
  instance: { instanceName: 'painel-a1b2c3', status: 'connecting' },
  hash: '34274A53-2CBE-4A68-BFE3-B8EDD83815CE',
  qrcode: { pairingCode: '6MA24GK4', code: '2@abc', base64: 'data:image/png;base64,iVBOR', count: 1 },
};

function stubJson(payload: unknown, ok = true, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue({ ok, status, json: async () => payload });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isPairable', () => {
  it('reconhece o adapter que implementa o contrato de pareamento', () => {
    expect(isPairable(evolutionAdapter)).toBe(true);
  });

  it('recusa o adapter que não parea — a Meta identifica o número pela conta comercial', () => {
    expect(isPairable(metaCloudAdapter)).toBe(false);
  });
});

describe('beginPairing', () => {
  it('cria a instância com os riders que só existem no momento da criação', async () => {
    const fetchMock = stubJson(CREATE_RESPONSE);

    await evolutionPairing.beginPairing(PAIRING_INPUT, OPTIONS);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://evo.exemplo.com/instance/create');
    expect(init.headers.apikey).toBe('chave');
    const body = JSON.parse(init.body);
    // Default da Evolution é `false` nos dois: número de cobrança recebe ligação e pode ser
    // jogado em grupo. `syncFullHistory: true` puxaria o histórico inteiro do operador.
    expect(body.groupsIgnore).toBe(true);
    expect(body.rejectCall).toBe(true);
    expect(body.syncFullHistory).toBe(false);
    expect(body.instanceName).toBe('painel-a1b2c3');
    // Sem `number`, a Evolution não emite o código de 8 caracteres — só o QR.
    expect(body.number).toBe('5565999998888');
  });

  it('manda o nosso token como header do webhook — é o que faz o opt-out chegar (T5)', async () => {
    const fetchMock = stubJson(CREATE_RESPONSE);

    await evolutionPairing.beginPairing(PAIRING_INPUT, OPTIONS);

    const { webhook } = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(webhook.headers.apikey).toBe('token-do-webhook');
    expect(webhook.url).toBe('https://painel.exemplo.com/api/webhooks/evolution');
    expect(webhook.events).toContain('MESSAGES_UPSERT');
    expect(webhook.events).toContain('CONNECTION_UPDATE');
  });

  it('devolve o QR e o código de pareamento, aguardando leitura', async () => {
    stubJson(CREATE_RESPONSE);

    const challenge = await evolutionPairing.beginPairing(PAIRING_INPUT, OPTIONS);

    expect(challenge).toEqual({
      qrBase64: 'data:image/png;base64,iVBOR',
      pairingCode: '6MA24GK4',
      state: 'AWAITING_SCAN',
    });
  });

  it('ignora o hash da resposta — é o token interno da instância, não o nosso segredo', async () => {
    stubJson(CREATE_RESPONSE);

    const challenge = await evolutionPairing.beginPairing(PAIRING_INPUT, OPTIONS);

    expect(JSON.stringify(challenge)).not.toContain(CREATE_RESPONSE.hash);
  });

  it('rejeita entrada com forma inválida antes de falar com o servidor', async () => {
    const fetchMock = stubJson(CREATE_RESPONSE);

    await expect(
      evolutionPairing.beginPairing({ baseUrl: 'não-é-url', apiKey: '', pairingNumber: '99' }, OPTIONS),
    ).rejects.toThrow(ChannelCredentialsInvalidError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('propaga a mensagem do servidor quando a criação falha', async () => {
    // Forma real do 403 de nome repetido na tag 2.3.7: a mensagem vem em lista.
    stubJson({ status: 403, error: 'Forbidden', response: { message: ['This name "x" is already in use.'] } }, false, 403);

    await expect(evolutionPairing.beginPairing(PAIRING_INPUT, OPTIONS)).rejects.toThrow('already in use');
  });
});

describe('refreshChallenge', () => {
  it('devolve um QR novo enquanto ninguém leu — o do WhatsApp expira em menos de um minuto', async () => {
    const fetchMock = stubJson({ pairingCode: null, code: '2@xyz', base64: 'data:image/png;base64,QQQQ', count: 2 });

    const challenge = await evolutionPairing.refreshChallenge(CREDENTIALS);

    expect(fetchMock.mock.calls[0][0]).toBe('https://evo.exemplo.com/instance/connect/painel-a1b2c3');
    expect(challenge).toEqual({ qrBase64: 'data:image/png;base64,QQQQ', pairingCode: undefined, state: 'AWAITING_SCAN' });
  });

  it('reporta CONNECTED sem QR quando a sessão já está aberta', async () => {
    stubJson({ instance: { instanceName: 'painel-a1b2c3', state: 'open' } });

    expect(await evolutionPairing.refreshChallenge(CREDENTIALS)).toEqual({ state: 'CONNECTED' });
  });
});

describe('unpair', () => {
  it('faz logout da instância sem apagá-la — reparear é ler outro QR', async () => {
    const fetchMock = stubJson({ status: 'SUCCESS' });

    await evolutionPairing.unpair(CREDENTIALS);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://evo.exemplo.com/instance/logout/painel-a1b2c3');
    expect(init.method).toBe('DELETE');
  });
});
