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

  it('ordena por createdAt desc, mesmo com múltiplas mensagens', async () => {
    const customer = await db.customer.create({ data: { name: 'Timeline Ordem', phone: '+5511999990003' } });
    const older = await db.message.create({
      data: {
        customerId: customer.id,
        kind: 'MANUAL',
        status: 'SENT',
        toPhone: customer.phone!,
        body: 'Primeira',
        scheduledFor: new Date(),
        scheduledDate: new Date(),
        sentAt: new Date(),
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
    });
    const newer = await db.message.create({
      data: {
        customerId: customer.id,
        kind: 'MANUAL',
        status: 'SENT',
        toPhone: customer.phone!,
        body: 'Segunda',
        scheduledFor: new Date(),
        scheduledDate: new Date(),
        sentAt: new Date(),
        createdAt: new Date('2026-01-02T00:00:00Z'),
      },
    });

    const rows = await listMessagesForCustomer(customer.id);

    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe(newer.id);
    expect(rows[1].id).toBe(older.id);

    await db.message.deleteMany({ where: { customerId: customer.id } });
    await db.customer.delete({ where: { id: customer.id } });
  });

  it('inclui cancelReason quando a mensagem foi cancelada', async () => {
    const customer = await db.customer.create({ data: { name: 'Timeline Teste', phone: '+5511999990004' } });
    await db.message.create({
      data: {
        customerId: customer.id, kind: 'DUNNING', status: 'CANCELLED', cancelReason: 'stale',
        toPhone: customer.phone!, body: 'Oi', scheduledFor: new Date(), scheduledDate: new Date(),
      },
    });

    const rows = await listMessagesForCustomer(customer.id);

    expect(rows[0].cancelReason).toBe('stale');

    await db.message.deleteMany({ where: { customerId: customer.id } });
    await db.customer.delete({ where: { id: customer.id } });
  });
});
