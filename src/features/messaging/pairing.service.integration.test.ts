import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { decrypt } from '@/lib/crypto';
import {
  beginChannelPairing,
  changeChannelNumber,
  refreshChannelPairing,
  unpairChannel,
  ChannelPairingNotSupportedError,
} from './pairing.service';
import { ChannelNotConfiguredError, ChannelRiskNotAcceptedError } from './service';

process.env.CREDENTIAL_KEY = process.env.CREDENTIAL_KEY ?? Buffer.alloc(32, 7).toString('base64');
process.env.APP_URL = process.env.APP_URL ?? 'https://painel.exemplo.com';

const TYPED = { baseUrl: 'https://evo.exemplo.com', apiKey: 'chave-da-evolution', pairingNumber: '+5565999998888' };

const INPUT = { provider: 'EVOLUTION', methodId: 'qr', credentials: TYPED, riskAccepted: true } as const;

const QR = { pairingCode: '6MA24GK4', code: '2@abc', base64: 'data:image/png;base64,iVBOR', count: 1 };

function stubEvolution(...payloads: unknown[]) {
  const fetchMock = vi.fn();
  for (const payload of payloads) {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => payload });
  }
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function purge() {
  await db.channelConfig.deleteMany({ where: { provider: 'EVOLUTION' } });
}

// O Postgres de integração é compartilhado: purga antes e depois, nunca só depois.
beforeAll(purge);
afterAll(purge);
afterEach(async () => {
  vi.unstubAllGlobals();
  await purge();
});

async function storedCredentials(): Promise<Record<string, string>> {
  const row = await db.channelConfig.findUniqueOrThrow({ where: { provider: 'EVOLUTION' } });
  return JSON.parse(decrypt(row.credentials, 'channel.credentials'));
}

describe('beginChannelPairing', () => {
  it('gera o nome da instância e o token do webhook em vez de pedir ao operador', async () => {
    stubEvolution({ qrcode: QR });

    await beginChannelPairing(INPUT);
    const credentials = await storedCredentials();

    expect(credentials.instanceName).toMatch(/^painel-[0-9a-f]{12}$/);
    expect(credentials.webhookToken).toHaveLength(64);
    expect(credentials.baseUrl).toBe(TYPED.baseUrl);
  });

  it('grava a credencial criptografada e devolve o desafio sem persistir o QR', async () => {
    stubEvolution({ qrcode: QR });

    const challenge = await beginChannelPairing(INPUT);
    const row = await db.channelConfig.findUniqueOrThrow({ where: { provider: 'EVOLUTION' } });

    expect(challenge).toEqual({ qrBase64: QR.base64, pairingCode: QR.pairingCode, state: 'AWAITING_SCAN' });
    expect(row.credentials).not.toContain(TYPED.apiKey);
    expect(JSON.stringify(row)).not.toContain(QR.base64);
    expect(JSON.stringify(row)).not.toContain(QR.pairingCode);
  });

  it('deixa o canal por testar até alguém ler o QR — ativar exige teste bem-sucedido', async () => {
    stubEvolution({ qrcode: QR });

    await beginChannelPairing(INPUT);
    const row = await db.channelConfig.findUniqueOrThrow({ where: { provider: 'EVOLUTION' } });

    expect(row.lastCheckOk).toBeNull();
    expect(row.phoneNumber).toBeNull();
    expect(row.riskAcceptedAt).toBeInstanceOf(Date);
  });

  it('reabrir com os mesmos dados continua o pareamento, sem criar outra instância', async () => {
    stubEvolution({ qrcode: QR });
    await beginChannelPairing(INPUT);
    const first = await storedCredentials();

    const fetchMock = stubEvolution({ ...QR, base64: 'data:image/png;base64,SEGUNDO' });
    const challenge = await beginChannelPairing(INPUT);

    expect(fetchMock.mock.calls[0][0]).toContain('/instance/connect/');
    expect(challenge.qrBase64).toBe('data:image/png;base64,SEGUNDO');
    expect((await storedCredentials()).instanceName).toBe(first.instanceName);
  });

  it('trocar o servidor provisiona do zero — não parear contra a instância antiga', async () => {
    stubEvolution({ qrcode: QR });
    await beginChannelPairing(INPUT);
    const first = await storedCredentials();

    const fetchMock = stubEvolution({ qrcode: QR });
    await beginChannelPairing({ ...INPUT, credentials: { ...TYPED, baseUrl: 'https://outro.exemplo.com' } });

    expect(fetchMock.mock.calls[0][0]).toBe('https://outro.exemplo.com/instance/create');
    expect((await storedCredentials()).instanceName).not.toBe(first.instanceName);
  });

  it('recusa parear sem aceite do risco do canal', async () => {
    const fetchMock = stubEvolution({ qrcode: QR });

    await expect(
      beginChannelPairing({ ...INPUT, riskAccepted: false } as unknown as typeof INPUT),
    ).rejects.toThrow(ChannelRiskNotAcceptedError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('recusa caminho de pareamento que o descritor não declara', async () => {
    await expect(
      beginChannelPairing({ ...INPUT, methodId: 'manual' } as unknown as typeof INPUT),
    ).rejects.toThrow(ChannelPairingNotSupportedError);
  });
});

describe('refreshChannelPairing', () => {
  it('marca o canal como testado quando o provider reporta a sessão aberta', async () => {
    stubEvolution({ qrcode: QR });
    await beginChannelPairing(INPUT);

    stubEvolution({ instance: { instanceName: 'painel', state: 'open' } });
    const challenge = await refreshChannelPairing('EVOLUTION');

    const row = await db.channelConfig.findUniqueOrThrow({ where: { provider: 'EVOLUTION' } });
    expect(challenge.state).toBe('CONNECTED');
    expect(row.lastCheckOk).toBe(true);
    expect(row.disconnectedAt).toBeNull();
  });

  it('não promove o canal enquanto ninguém leu o QR', async () => {
    stubEvolution({ qrcode: QR });
    await beginChannelPairing(INPUT);

    stubEvolution(QR);
    await refreshChannelPairing('EVOLUTION');

    const row = await db.channelConfig.findUniqueOrThrow({ where: { provider: 'EVOLUTION' } });
    expect(row.lastCheckOk).toBeNull();
  });

  it('recusa canal nunca configurado', async () => {
    await expect(refreshChannelPairing('EVOLUTION')).rejects.toThrow(ChannelNotConfiguredError);
  });
});

describe('changeChannelNumber', () => {
  it('reusa endereço e chave já salvos — não pede nada além do número', async () => {
    stubEvolution({ qrcode: QR });
    await beginChannelPairing(INPUT);
    const before = await storedCredentials();

    const fetchMock = stubEvolution({ status: 'SUCCESS' }, { qrcode: { ...QR, base64: 'data:image/png;base64,NOVO' } });
    const challenge = await changeChannelNumber('EVOLUTION', '+5511988887777');

    // apaga a instância antiga, depois cria — mesma URL/chave, mesmo nome de instância.
    expect(fetchMock.mock.calls[0][0]).toContain('/instance/delete/');
    expect(fetchMock.mock.calls[1][0]).toBe('https://evo.exemplo.com/instance/create');
    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(body.instanceName).toBe(before.instanceName);
    expect(body.number).toBe('5511988887777');
    expect(challenge.qrBase64).toBe('data:image/png;base64,NOVO');

    const after = await storedCredentials();
    expect(after.instanceName).toBe(before.instanceName);
    expect(after.webhookToken).toBe(before.webhookToken);
  });

  it('volta o canal pra "ainda não testado" — sessão nova exige confirmação nova', async () => {
    stubEvolution({ qrcode: QR });
    await beginChannelPairing(INPUT);
    stubEvolution({ instance: { instanceName: 'painel', state: 'open' } });
    await refreshChannelPairing('EVOLUTION');

    stubEvolution({ status: 'SUCCESS' }, { qrcode: QR });
    await changeChannelNumber('EVOLUTION', '+5511988887777');

    const row = await db.channelConfig.findUniqueOrThrow({ where: { provider: 'EVOLUTION' } });
    expect(row.lastCheckOk).toBeNull();
    expect(row.phoneNumber).toBeNull();
  });

  it('recusa canal nunca configurado', async () => {
    await expect(changeChannelNumber('EVOLUTION', '+5511988887777')).rejects.toThrow(ChannelNotConfiguredError);
  });
});

describe('unpairChannel', () => {
  it('desconecta o aparelho e deixa o motivo visível para o operador', async () => {
    stubEvolution({ qrcode: QR });
    await beginChannelPairing(INPUT);

    const fetchMock = stubEvolution({ status: 'SUCCESS' });
    await unpairChannel('EVOLUTION');

    const row = await db.channelConfig.findUniqueOrThrow({ where: { provider: 'EVOLUTION' } });
    expect(fetchMock.mock.calls[0][0]).toContain('/instance/logout/');
    expect(row.lastCheckOk).toBe(false);
    expect(row.lastError).toContain('QR Code');
    expect(row.disconnectedAt).toBeInstanceOf(Date);
  });
});
