import { afterEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { listChannelConfigs, listMessagesForCustomer } from './queries';

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

describe('listMessagesForCustomer', () => {
  it('devolve as mensagens do cliente, mais recente primeiro', async () => {
    const customer = await db.customer.create({ data: { name: 'Timeline Teste', phone: '+5511999990002' } });
    await db.message.create({
      data: { customerId: customer.id, kind: 'MANUAL', status: 'SENT', toPhone: customer.phone!, body: 'Oi', scheduledFor: new Date(), scheduledDate: new Date(), sentAt: new Date() },
    });

    const rows = await listMessagesForCustomer(customer.id);

    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('SENT');
    expect(rows[0].body).toBe('Oi');

    await db.message.deleteMany({ where: { customerId: customer.id } });
    await db.customer.delete({ where: { id: customer.id } });
  });
});
