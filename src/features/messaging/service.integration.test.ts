import { afterEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import {
  saveChannelCredentials,
  testChannelConnection,
  setChannelActive,
  setDefaultChannel,
  EvolutionRiskNotAcceptedError,
  ChannelNotVerifiedError,
} from './service';

process.env.CREDENTIAL_KEY = process.env.CREDENTIAL_KEY ?? Buffer.alloc(32, 7).toString('base64');

afterEach(async () => {
  vi.restoreAllMocks();
  await db.channelConfig.deleteMany({ where: { provider: { in: ['META_CLOUD', 'EVOLUTION', 'SALVY'] } } });
});

describe('saveChannelCredentials', () => {
  it('salva e cripta — chamar duas vezes não duplica a linha', async () => {
    await saveChannelCredentials({ provider: 'META_CLOUD', credentials: { accessToken: 'a', phoneNumberId: 'b', wabaId: 'c' } });
    await saveChannelCredentials({ provider: 'META_CLOUD', credentials: { accessToken: 'a2', phoneNumberId: 'b', wabaId: 'c' } });

    const rows = await db.channelConfig.findMany({ where: { provider: 'META_CLOUD' } });
    expect(rows).toHaveLength(1);
    expect(rows[0].credentials).not.toContain('a2');
  });

  it('rejeita EVOLUTION sem riskAccepted', async () => {
    await expect(
      saveChannelCredentials({
        provider: 'EVOLUTION',
        credentials: { baseUrl: 'https://x.com', apiKey: 'k', instanceName: 'i' },
        riskAccepted: true,
      } as never),
    ).resolves.toBeUndefined();

    await db.channelConfig.deleteMany({ where: { provider: 'EVOLUTION' } });

    // @ts-expect-error -- omitindo riskAccepted de propósito pra testar a trava do service
    await expect(saveChannelCredentials({ provider: 'EVOLUTION', credentials: { baseUrl: 'https://x.com', apiKey: 'k', instanceName: 'i' } }))
      .rejects.toThrow(EvolutionRiskNotAcceptedError);
  });
});

describe('testChannelConnection', () => {
  it('grava lastCheckOk=true e retorna ok quando o adapter confirma', async () => {
    await saveChannelCredentials({ provider: 'META_CLOUD', credentials: { accessToken: 'a', phoneNumberId: 'b', wabaId: 'c' } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: 'b' }) }));

    const result = await testChannelConnection('META_CLOUD');

    expect(result).toEqual({ ok: true });
    const row = await db.channelConfig.findUniqueOrThrow({ where: { provider: 'META_CLOUD' } });
    expect(row.lastCheckOk).toBe(true);
    vi.unstubAllGlobals();
  });

  it('grava lastError quando o adapter falha', async () => {
    await saveChannelCredentials({ provider: 'META_CLOUD', credentials: { accessToken: 'a', phoneNumberId: 'b', wabaId: 'c' } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: { message: 'token inválido' } }) }));

    const result = await testChannelConnection('META_CLOUD');

    expect(result).toEqual({ ok: false, reason: 'token inválido' });
    const row = await db.channelConfig.findUniqueOrThrow({ where: { provider: 'META_CLOUD' } });
    expect(row.lastCheckOk).toBe(false);
    expect(row.lastError).toBe('token inválido');
    vi.unstubAllGlobals();
  });
});

describe('setChannelActive', () => {
  it('rejeita ativar canal nunca testado', async () => {
    await saveChannelCredentials({ provider: 'META_CLOUD', credentials: { accessToken: 'a', phoneNumberId: 'b', wabaId: 'c' } });
    await expect(setChannelActive('META_CLOUD', true)).rejects.toThrow(ChannelNotVerifiedError);
  });

  it('permite ativar depois de um teste com sucesso', async () => {
    await saveChannelCredentials({ provider: 'META_CLOUD', credentials: { accessToken: 'a', phoneNumberId: 'b', wabaId: 'c' } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: 'b' }) }));
    await testChannelConnection('META_CLOUD');
    vi.unstubAllGlobals();

    await setChannelActive('META_CLOUD', true);

    const row = await db.channelConfig.findUniqueOrThrow({ where: { provider: 'META_CLOUD' } });
    expect(row.isActive).toBe(true);
  });
});

describe('setDefaultChannel', () => {
  it('só um canal fica isDefault mesmo chamando pra dois em sequência', async () => {
    for (const provider of ['META_CLOUD', 'EVOLUTION'] as const) {
      await saveChannelCredentials(
        provider === 'META_CLOUD'
          ? { provider, credentials: { accessToken: 'a', phoneNumberId: 'b', wabaId: 'c' } }
          : { provider, credentials: { baseUrl: 'https://x.com', apiKey: 'k', instanceName: 'i' }, riskAccepted: true },
      );
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: 'b', instance: { state: 'open' } }) }));
      await testChannelConnection(provider);
      vi.unstubAllGlobals();
      await setChannelActive(provider, true);
    }

    await setDefaultChannel('META_CLOUD');
    await setDefaultChannel('EVOLUTION');

    const rows = await db.channelConfig.findMany({ where: { provider: { in: ['META_CLOUD', 'EVOLUTION'] } } });
    expect(rows.filter((r) => r.isDefault)).toHaveLength(1);
    expect(rows.find((r) => r.isDefault)?.provider).toBe('EVOLUTION');
  });
});
