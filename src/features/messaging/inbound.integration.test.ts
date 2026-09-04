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

  it('fromPhone sem "+" (formato entregue pelos adapters de webhook) casa com Customer.phone E.164', async () => {
    const channel = await seedChannel();
    const customer = await db.customer.create({ data: { name: 'Inbound Teste', phone: '+5511999990014' } });

    await processInboundMessage({ channelId: channel.id, fromPhone: '5511999990014', text: 'PARE', now: NOW });

    const refreshed = await db.customer.findUniqueOrThrow({ where: { id: customer.id } });
    expect(refreshed.optedOut).toBe(true);
    const messages = await db.message.findMany({ where: { customerId: customer.id } });
    expect(messages).toHaveLength(1);
    expect(messages[0].toPhone).toBe('+5511999990014');
  });

  it('telefone sem Customer correspondente: não grava Message, não lança', async () => {
    const channel = await seedChannel();
    await expect(
      processInboundMessage({ channelId: channel.id, fromPhone: '+5511999999999', text: 'Oi', now: NOW }),
    ).resolves.toBeUndefined();
    const messages = await db.message.findMany({ where: { toPhone: '+5511999999999' } });
    expect(messages).toHaveLength(0);
  });

  // `Customer.phone` não é mais `@@unique` (migration 00000000000020) — duas
  // pessoas cobradas separadamente podem dividir um WhatsApp. T5 tem que valer
  // pro número, não só pro primeiro Customer encontrado: quem manda "SAIR"
  // não pode continuar recebendo cobrança pela porta dos fundos do outro
  // cadastro que usa o mesmo telefone.
  describe('telefone com mais de um Customer', () => {
    it('"SAIR" opta os dois cadastros que dividem o telefone, não só um', async () => {
      const channel = await seedChannel();
      const a = await db.customer.create({ data: { name: 'Inbound Teste', phone: '+5511999990020' } });
      const b = await db.customer.create({ data: { name: 'Inbound Teste', phone: '+5511999990020' } });

      await processInboundMessage({ channelId: channel.id, fromPhone: '+5511999990020', text: 'SAIR', now: NOW });

      const refreshedA = await db.customer.findUniqueOrThrow({ where: { id: a.id } });
      const refreshedB = await db.customer.findUniqueOrThrow({ where: { id: b.id } });
      expect(refreshedA.optedOut).toBe(true);
      expect(refreshedB.optedOut).toBe(true);
    });

    it('mensagem sem palavra-chave grava uma Message por cadastro que divide o telefone', async () => {
      const channel = await seedChannel();
      const a = await db.customer.create({ data: { name: 'Inbound Teste', phone: '+5511999990021' } });
      const b = await db.customer.create({ data: { name: 'Inbound Teste', phone: '+5511999990021' } });

      await processInboundMessage({ channelId: channel.id, fromPhone: '+5511999990021', text: 'Oi', now: NOW });

      const messagesA = await db.message.findMany({ where: { customerId: a.id } });
      const messagesB = await db.message.findMany({ where: { customerId: b.id } });
      expect(messagesA).toHaveLength(1);
      expect(messagesB).toHaveLength(1);
      const refreshedA = await db.customer.findUniqueOrThrow({ where: { id: a.id } });
      const refreshedB = await db.customer.findUniqueOrThrow({ where: { id: b.id } });
      expect(refreshedA.optedOut).toBe(false);
      expect(refreshedB.optedOut).toBe(false);
    });

    it('um já opted-out e o outro não: "SAIR" só muda quem faltava, sem duplicar o que já tinha', async () => {
      const channel = await seedChannel();
      const already = await db.customer.create({
        data: { name: 'Inbound Teste', phone: '+5511999990022', optedOut: true, optedOutReason: 'Palavra-chave: PARE' },
      });
      const pending = await db.customer.create({ data: { name: 'Inbound Teste', phone: '+5511999990022' } });

      await processInboundMessage({ channelId: channel.id, fromPhone: '+5511999990022', text: 'SAIR', now: NOW });

      const refreshedAlready = await db.customer.findUniqueOrThrow({ where: { id: already.id } });
      const refreshedPending = await db.customer.findUniqueOrThrow({ where: { id: pending.id } });
      expect(refreshedAlready.optedOutReason).toBe('Palavra-chave: PARE'); // não reescreve
      expect(refreshedPending.optedOut).toBe(true);
      expect(refreshedPending.optedOutReason).toContain('SAIR');
    });
  });
});
