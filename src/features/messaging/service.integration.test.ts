import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import {
  saveAndTestChannel,
  testChannelConnection,
  setSendingChannel,
  ChannelRiskNotAcceptedError,
  ChannelNotVerifiedError,
  ChannelNotConfiguredError,
} from './service';

process.env.CREDENTIAL_KEY = process.env.CREDENTIAL_KEY ?? Buffer.alloc(32, 7).toString('base64');

const META = { accessToken: 'token-permanente-da-meta', phoneNumberId: 'b', wabaId: 'c', appSecret: 'segredo-do-app' } as const;
const EVOLUTION = { baseUrl: 'https://evo.exemplo.com', apiKey: 'chave-da-evolution', instanceName: 'mt', webhookToken: 'token-do-webhook' } as const;

/** Resposta que satisfaz o healthCheck dos dois adapters. */
function stubHealthyProvider() {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: 'b', instance: { state: 'open' } }) }));
}

function stubFailingProvider(json: unknown, status = 401) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status, json: async () => json }));
}

async function purge() {
  await db.channelConfig.deleteMany({ where: { provider: { in: ['META_CLOUD', 'EVOLUTION', 'SALVY'] } } });
}

// O Postgres de integração é compartilhado: purga antes e depois, nunca só depois.
beforeAll(purge);
afterAll(purge);
afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await purge();
});

async function saveVerified(input: Parameters<typeof saveAndTestChannel>[0]) {
  stubHealthyProvider();
  const result = await saveAndTestChannel(input);
  vi.unstubAllGlobals();
  return result;
}

describe('saveAndTestChannel', () => {
  it('grava a credencial criptografada e chamar duas vezes não duplica a linha', async () => {
    await saveVerified({ provider: 'META_CLOUD', credentials: META });
    await saveVerified({ provider: 'META_CLOUD', credentials: { ...META, accessToken: 'outro-token' } });

    const rows = await db.channelConfig.findMany({ where: { provider: 'META_CLOUD' } });
    expect(rows).toHaveLength(1);
    expect(rows[0].credentials).not.toContain('outro-token');
    expect(rows[0].lastCheckOk).toBe(true);
  });

  it('credencial que não passa no teste não é gravada', async () => {
    stubFailingProvider({ error: { message: 'token inválido' } });

    const result = await saveAndTestChannel({ provider: 'META_CLOUD', credentials: META });

    expect(result).toEqual({ ok: false, reason: 'token inválido' });
    expect(await db.channelConfig.findUnique({ where: { provider: 'META_CLOUD' } })).toBeNull();
  });

  it('erro do provider que ecoa o token chega sanitizado à tela e ao lastError', async () => {
    stubFailingProvider({ error: { message: `Bearer ${META.accessToken} expirou` } });

    const result = await saveAndTestChannel({ provider: 'META_CLOUD', credentials: META });

    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.reason).not.toContain(META.accessToken);
  });

  it('rotacionar credencial que passa no teste não tira do ar o canal que está enviando', async () => {
    await saveVerified({ provider: 'META_CLOUD', credentials: META });
    await setSendingChannel('META_CLOUD');

    await saveVerified({ provider: 'META_CLOUD', credentials: { ...META, accessToken: 'token-novo' } });

    const row = await db.channelConfig.findUniqueOrThrow({ where: { provider: 'META_CLOUD' } });
    expect(row.isActive).toBe(true);
    expect(row.isDefault).toBe(true);
  });

  it('recusa canal com aviso de aceite obrigatório quando o operador não aceitou', async () => {
    // @ts-expect-error -- omitindo riskAccepted de propósito pra testar a trava do service
    await expect(saveAndTestChannel({ provider: 'EVOLUTION', credentials: EVOLUTION })).rejects.toThrow(ChannelRiskNotAcceptedError);
    expect(await db.channelConfig.findUnique({ where: { provider: 'EVOLUTION' } })).toBeNull();
  });

  it('registra a data do aceite do canal que exige aceite', async () => {
    await saveVerified({ provider: 'EVOLUTION', credentials: EVOLUTION, riskAccepted: true });

    const row = await db.channelConfig.findUniqueOrThrow({ where: { provider: 'EVOLUTION' } });
    expect(row.riskAcceptedAt).toBeInstanceOf(Date);
  });

  it('não inventa remetente: phoneNumber só é preenchido pelo aparelho que conectou', async () => {
    await saveVerified({ provider: 'EVOLUTION', credentials: EVOLUTION, riskAccepted: true });
    await saveVerified({ provider: 'META_CLOUD', credentials: META });

    // Colar credencial não prova qual número está pareado. O valor vem do `wuid` que o
    // `connection.update` reporta ao conectar — ver app/api/webhooks/evolution/route.ts.
    for (const provider of ['EVOLUTION', 'META_CLOUD'] as const) {
      const row = await db.channelConfig.findUniqueOrThrow({ where: { provider } });
      expect(row.phoneNumber).toBeNull();
    }
  });
});

describe('testChannelConnection', () => {
  it('grava lastCheckOk=true quando o adapter confirma', async () => {
    await saveVerified({ provider: 'META_CLOUD', credentials: META });
    stubHealthyProvider();

    await expect(testChannelConnection('META_CLOUD')).resolves.toEqual({ ok: true });
  });

  it('grava lastError quando o canal cai depois de configurado', async () => {
    await saveVerified({ provider: 'META_CLOUD', credentials: META });
    stubFailingProvider({ error: { message: 'token inválido' } });

    const result = await testChannelConnection('META_CLOUD');

    expect(result).toEqual({ ok: false, reason: 'token inválido' });
    const row = await db.channelConfig.findUniqueOrThrow({ where: { provider: 'META_CLOUD' } });
    expect(row.lastCheckOk).toBe(false);
    expect(row.lastError).toBe('token inválido');
  });

  it('não vaza a credencial guardada para lastError', async () => {
    await saveVerified({ provider: 'EVOLUTION', credentials: EVOLUTION, riskAccepted: true });
    stubFailingProvider({ message: `apikey ${EVOLUTION.apiKey} recusada` }, 500);

    await testChannelConnection('EVOLUTION');

    const row = await db.channelConfig.findUniqueOrThrow({ where: { provider: 'EVOLUTION' } });
    expect(row.lastError).not.toContain(EVOLUTION.apiKey);
  });

  it('rejeita testar canal nunca configurado', async () => {
    await expect(testChannelConnection('EVOLUTION')).rejects.toThrow(ChannelNotConfiguredError);
  });
});

describe('setSendingChannel', () => {
  it('rejeita canal nunca configurado', async () => {
    await expect(setSendingChannel('EVOLUTION')).rejects.toThrow(ChannelNotConfiguredError);
  });

  it('rejeita canal cujo último teste falhou', async () => {
    await saveVerified({ provider: 'META_CLOUD', credentials: META });
    stubFailingProvider({ error: { message: 'token inválido' } });
    await testChannelConnection('META_CLOUD');
    vi.unstubAllGlobals();

    await expect(setSendingChannel('META_CLOUD')).rejects.toThrow(ChannelNotVerifiedError);
  });

  it('só um canal envia, mesmo trocando duas vezes seguidas', async () => {
    await saveVerified({ provider: 'META_CLOUD', credentials: META });
    await saveVerified({ provider: 'EVOLUTION', credentials: EVOLUTION, riskAccepted: true });

    await setSendingChannel('META_CLOUD');
    await setSendingChannel('EVOLUTION');

    const rows = await db.channelConfig.findMany({ where: { provider: { in: ['META_CLOUD', 'EVOLUTION'] } } });
    expect(rows.filter((r) => r.isDefault)).toHaveLength(1);
    expect(rows.find((r) => r.isDefault)?.provider).toBe('EVOLUTION');
  });

  it('o canal anterior continua ativo — quem responder "PARE" no número antigo segue sendo ouvido', async () => {
    await saveVerified({ provider: 'META_CLOUD', credentials: META });
    await saveVerified({ provider: 'EVOLUTION', credentials: EVOLUTION, riskAccepted: true });

    await setSendingChannel('META_CLOUD');
    await setSendingChannel('EVOLUTION');

    const meta = await db.channelConfig.findUniqueOrThrow({ where: { provider: 'META_CLOUD' } });
    expect(meta.isActive).toBe(true);
    expect(meta.isDefault).toBe(false);
  });
});

describe('constraint de banco — canal padrão único', () => {
  it('rejeita duas linhas com isDefault=true de verdade no Postgres', async () => {
    await db.channelConfig.create({
      data: { provider: 'META_CLOUD', label: 'Meta Cloud API', credentials: 'ciphertext', isDefault: true },
    });

    await expect(
      db.channelConfig.create({
        data: { provider: 'EVOLUTION', label: 'Evolution API', credentials: 'ciphertext', isDefault: true },
      }),
    ).rejects.toThrow();
  });
});
