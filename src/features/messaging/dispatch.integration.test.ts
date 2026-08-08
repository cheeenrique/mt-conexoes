import { afterEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { encrypt } from '@/lib/crypto';
import { sendManualBatch, NoDefaultChannelError, OutsideQuietHoursError } from './dispatch';
import { UnknownTemplateVariableError } from '@/lib/errors';

process.env.CREDENTIAL_KEY = process.env.CREDENTIAL_KEY ?? Buffer.alloc(32, 9).toString('base64');

const IN_HOURS_NOW = new Date('2026-08-08T15:00:00Z'); // 12h em America/Sao_Paulo, dentro de 8-20
const OUT_OF_HOURS_NOW = new Date('2026-08-09T02:00:00Z'); // 23h local, fora de 8-20

// EVOLUTION suporta texto livre (supportsFreeText: true) — o adapter chama fetch()
// direto com o body, sem exigir template aprovado. META_CLOUD exige templateRef
// (regra de domínio ⚠️ de CLAUDE.md) e não serve para exercitar o envio de texto
// livre do disparo manual.
async function seedActiveDefaultChannel() {
  await db.channelConfig.create({
    data: {
      provider: 'EVOLUTION',
      label: 'Evolution API',
      isActive: true,
      isDefault: true,
      credentials: encrypt(
        JSON.stringify({ baseUrl: 'https://evolution.example.com', apiKey: 'a', instanceName: 'default' }),
        'channel.credentials',
      ),
      lastCheckOk: true,
    },
  });
}

async function seedCustomer(overrides: Partial<{ phone: string | null; optedOut: boolean }> = {}) {
  return db.customer.create({
    data: {
      name: 'Cliente Teste',
      phone: 'phone' in overrides ? overrides.phone : '+5511998880000',
      optedOut: overrides.optedOut ?? false,
    },
  });
}

afterEach(async () => {
  vi.restoreAllMocks();
  await db.message.deleteMany({ where: { customer: { name: 'Cliente Teste' } } });
  await db.customer.deleteMany({ where: { name: 'Cliente Teste' } });
  await db.channelConfig.deleteMany({ where: { provider: 'EVOLUTION' } });
});

describe('sendManualBatch', () => {
  it('rejeita variável desconhecida sem criar nenhuma Message', async () => {
    await seedActiveDefaultChannel();
    const customer = await seedCustomer();

    await expect(
      sendManualBatch({ customerIds: [customer.id], body: 'Olá {{cliente.apelido}}', now: IN_HOURS_NOW }),
    ).rejects.toThrow(UnknownTemplateVariableError);

    const count = await db.message.count({ where: { customerId: customer.id } });
    expect(count).toBe(0);
  });

  it('rejeita sem canal padrão ativo, sem criar nenhuma Message', async () => {
    const customer = await seedCustomer();

    await expect(
      sendManualBatch({ customerIds: [customer.id], body: 'Olá {{cliente.primeiro_nome}}', now: IN_HOURS_NOW }),
    ).rejects.toThrow(NoDefaultChannelError);
  });

  it('rejeita fora de quiet hours, sem criar nenhuma Message', async () => {
    await seedActiveDefaultChannel();
    const customer = await seedCustomer();

    await expect(
      sendManualBatch({ customerIds: [customer.id], body: 'Olá {{cliente.primeiro_nome}}', now: OUT_OF_HOURS_NOW }),
    ).rejects.toThrow(OutsideQuietHoursError);

    const count = await db.message.count({ where: { customerId: customer.id } });
    expect(count).toBe(0);
  });

  it('cliente com optedOut nunca vira Message, aparece em skippedOptedOut', async () => {
    await seedActiveDefaultChannel();
    const optedOut = await seedCustomer({ optedOut: true });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ key: { id: 'x' } }) }));

    const summary = await sendManualBatch({ customerIds: [optedOut.id], body: 'Olá {{cliente.primeiro_nome}}', now: IN_HOURS_NOW });

    expect(summary).toEqual({ sent: 0, failed: 0, skippedOptedOut: 1, skippedNoPhone: 0 });
    const count = await db.message.count({ where: { customerId: optedOut.id } });
    expect(count).toBe(0);
  });

  it('cliente sem telefone nunca vira Message, aparece em skippedNoPhone', async () => {
    await seedActiveDefaultChannel();
    const noPhone = await seedCustomer({ phone: null });

    const summary = await sendManualBatch({ customerIds: [noPhone.id], body: 'Olá {{cliente.primeiro_nome}}', now: IN_HOURS_NOW });

    expect(summary).toEqual({ sent: 0, failed: 0, skippedOptedOut: 0, skippedNoPhone: 1 });
  });

  it('dois clientes, um sucesso e um falha — falha não derruba o sucesso anterior', async () => {
    await seedActiveDefaultChannel();
    const ok = await seedCustomer();
    const bad = await db.customer.create({ data: { name: 'Cliente Teste', phone: '+5511998880001', optedOut: false } });

    let call = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      call += 1;
      if (call === 1) return Promise.resolve({ ok: true, status: 200, json: async () => ({ key: { id: 'wamid1' } }) });
      return Promise.resolve({ ok: false, status: 400, json: async () => ({ message: 'rejeitado' } ) });
    }));

    const summary = await sendManualBatch({ customerIds: [ok.id, bad.id], body: 'Olá {{cliente.primeiro_nome}}', now: IN_HOURS_NOW });

    expect(summary.sent).toBe(1);
    expect(summary.failed).toBe(1);
    const messages = await db.message.findMany({ where: { customerId: { in: [ok.id, bad.id] } } });
    expect(messages).toHaveLength(2);
    expect(messages.find((m) => m.customerId === ok.id)?.status).toBe('SENT');
    expect(messages.find((m) => m.customerId === bad.id)?.status).toBe('FAILED');
  });

  it('mesmo customerId duas vezes na entrada gera uma única Message', async () => {
    await seedActiveDefaultChannel();
    const customer = await seedCustomer();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ key: { id: 'x' } }) }));

    await sendManualBatch({ customerIds: [customer.id, customer.id], body: 'Olá {{cliente.primeiro_nome}}', now: IN_HOURS_NOW });

    const count = await db.message.count({ where: { customerId: customer.id } });
    expect(count).toBe(1);
  });
});
