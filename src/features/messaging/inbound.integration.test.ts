import { afterEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { processInboundMessage } from './inbound';

const NOW = new Date('2026-08-10T15:00:00Z');

async function seedChannel() {
  return db.channelConfig.create({ data: { provider: 'META_CLOUD', label: 'Meta', credentials: 'x' } });
}

afterEach(async () => {
  await db.message.deleteMany({ where: { customer: { name: 'Inbound Teste' } } });
  await db.customer.deleteMany({ where: { name: 'Inbound Teste' } });
  await db.channelConfig.deleteMany({ where: { provider: 'META_CLOUD' } });
});

describe('processInboundMessage', () => {
  it('mensagem sem palavra-chave: grava Message RECEIVED, não mexe em optedOut', async () => {
    const channel = await seedChannel();
    const customer = await db.customer.create({ data: { name: 'Inbound Teste', phone: '+5511999990010' } });

    await processInboundMessage({ channelId: channel.id, fromPhone: '+5511999990010', text: 'Oi, tudo bem?', now: NOW });

    const messages = await db.message.findMany({ where: { customerId: customer.id } });
    expect(messages).toHaveLength(1);
    expect(messages[0].kind).toBe('INBOUND');
    expect(messages[0].status).toBe('RECEIVED');
    const refreshed = await db.customer.findUniqueOrThrow({ where: { id: customer.id } });
    expect(refreshed.optedOut).toBe(false);
  });

  it('mensagem "PARE" marca opt-out e grava a Message', async () => {
    const channel = await seedChannel();
    const customer = await db.customer.create({ data: { name: 'Inbound Teste', phone: '+5511999990011' } });

    await processInboundMessage({ channelId: channel.id, fromPhone: '+5511999990011', text: '  pare  ', now: NOW });

    const refreshed = await db.customer.findUniqueOrThrow({ where: { id: customer.id } });
    expect(refreshed.optedOut).toBe(true);
    expect(refreshed.optedOutReason).toContain('PARE');
    const messages = await db.message.findMany({ where: { customerId: customer.id } });
    expect(messages).toHaveLength(1);
  });

  it('substring de palavra-chave não dispara opt-out', async () => {
    const channel = await seedChannel();
    const customer = await db.customer.create({ data: { name: 'Inbound Teste', phone: '+5511999990012' } });

    await processInboundMessage({ channelId: channel.id, fromPhone: '+5511999990012', text: 'não quero mais pagar, pare com isso', now: NOW });

    const refreshed = await db.customer.findUniqueOrThrow({ where: { id: customer.id } });
    expect(refreshed.optedOut).toBe(false);
  });

  it('cliente já opted-out mandando a palavra de novo não quebra nem duplica', async () => {
    const channel = await seedChannel();
    const customer = await db.customer.create({ data: { name: 'Inbound Teste', phone: '+5511999990013', optedOut: true, optedOutReason: 'Palavra-chave: SAIR' } });

    await processInboundMessage({ channelId: channel.id, fromPhone: '+5511999990013', text: 'SAIR', now: NOW });

    const messages = await db.message.findMany({ where: { customerId: customer.id } });
    expect(messages).toHaveLength(1);
  });

  it('telefone sem Customer correspondente: não grava Message, não lança', async () => {
    const channel = await seedChannel();
    await expect(
      processInboundMessage({ channelId: channel.id, fromPhone: '+5511999999999', text: 'Oi', now: NOW }),
    ).resolves.toBeUndefined();
    const messages = await db.message.findMany({ where: { toPhone: '+5511999999999' } });
    expect(messages).toHaveLength(0);
  });
});
