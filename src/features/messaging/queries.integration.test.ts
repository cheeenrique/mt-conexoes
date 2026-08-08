import { afterEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { listChannelConfigs } from './queries';

afterEach(async () => {
  await db.channelConfig.deleteMany({ where: { provider: 'META_CLOUD' } });
});

describe('listChannelConfigs', () => {
  it('devolve os 3 providers mesmo sem nenhuma linha no banco', async () => {
    const rows = await listChannelConfigs();

    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.provider).sort()).toEqual(['EVOLUTION', 'META_CLOUD', 'SALVY']);
    expect(rows.every((r) => r.configured === false)).toBe(true);
  });

  it('marca configured=true e nunca inclui credentials quando existe linha', async () => {
    await db.channelConfig.create({
      data: { provider: 'META_CLOUD', label: 'Meta Cloud', credentials: 'ciphertext', isActive: true },
    });

    const rows = await listChannelConfigs();
    const meta = rows.find((r) => r.provider === 'META_CLOUD');

    expect(meta?.configured).toBe(true);
    expect(meta?.isActive).toBe(true);
    expect(meta).not.toHaveProperty('credentials');
  });
});
