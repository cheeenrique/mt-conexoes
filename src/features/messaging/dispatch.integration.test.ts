import { afterEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { encrypt } from '@/lib/crypto';
import {
  sendManualBatch,
  NoDefaultChannelError,
  OutsideQuietHoursError,
  ChannelDoesNotSupportFreeTextError,
  ChargeVariablesNotAllowedInManualSendError,
} from './dispatch';
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
        JSON.stringify({ baseUrl: 'https://evolution.example.com', apiKey: 'a', instanceName: 'default', webhookToken: 'webhook-token-teste' }),
        'channel.credentials',
      ),
      lastCheckOk: true,
    },
  });
}

// META_CLOUD exige templateRef aprovado (requiresApprovedTemplate: true,
// supportsFreeText: false) — usado só para provar que sendManualBatch rejeita
// esse canal de saída antes de tentar enviar qualquer coisa.
async function seedMetaCloudDefaultChannel() {
  await db.channelConfig.create({
    data: {
      provider: 'META_CLOUD',
      label: 'Meta Cloud API',
      isActive: true,
      isDefault: true,
      credentials: encrypt(JSON.stringify({ accessToken: 'a', phoneNumberId: 'b', wabaId: 'c' }), 'channel.credentials'),
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
  await db.channelConfig.deleteMany({ where: { provider: { in: ['EVOLUTION', 'META_CLOUD'] } } });
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

  it('rejeita variável de cobrança (sem contexto de charge no envio manual), sem criar nenhuma Message', async () => {
    await seedActiveDefaultChannel();
    const customer = await seedCustomer();

    await expect(
      sendManualBatch({ customerIds: [customer.id], body: 'Sua cobrança de {{cobranca.valor}} venceu', now: IN_HOURS_NOW }),
    ).rejects.toThrow(ChargeVariablesNotAllowedInManualSendError);

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

  it('rejeita canal padrão sem suporte a texto livre, sem criar nenhuma Message', async () => {
    await seedMetaCloudDefaultChannel();
    const customer = await seedCustomer();

    await expect(
      sendManualBatch({ customerIds: [customer.id], body: 'Olá {{cliente.primeiro_nome}}', now: IN_HOURS_NOW }),
    ).rejects.toThrow(ChannelDoesNotSupportFreeTextError);

    const count = await db.message.count({ where: { customerId: customer.id } });
    expect(count).toBe(0);
  });

  it('cliente com optedOut nunca vira Message, aparece em skippedOptedOut', async () => {
    await seedActiveDefaultChannel();
    const optedOut = await seedCustomer({ optedOut: true });
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const summary = await sendManualBatch({ customerIds: [optedOut.id], body: 'Olá {{cliente.primeiro_nome}}', now: IN_HOURS_NOW });

    expect(summary).toEqual({ queued: 0, skippedOptedOut: 1, skippedNoPhone: 0 });
    const count = await db.message.count({ where: { customerId: optedOut.id } });
    expect(count).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('cliente sem telefone nunca vira Message, aparece em skippedNoPhone', async () => {
    await seedActiveDefaultChannel();
    const noPhone = await seedCustomer({ phone: null });

    const summary = await sendManualBatch({ customerIds: [noPhone.id], body: 'Olá {{cliente.primeiro_nome}}', now: IN_HOURS_NOW });

    expect(summary).toEqual({ queued: 0, skippedOptedOut: 0, skippedNoPhone: 1 });
  });

  // O disparo manual assistido é o caminho de maior volume por clique (confirmação por
  // digitação só existe acima de 100 destinatários) e roda dentro de uma Server Action —
  // sem os ~15 min de folga do cron. Chamar o provider em rajada sequencial aqui é a
  // assinatura que heurística antispam do WhatsApp procura, e a espera ritmada (Evolution
  // 20/min) de um lote grande estouraria o timeout da Action. sendManualBatch por isso só
  // enfileira: quem chama o provider, no ritmo de `sendDelayMs`, é dispatchPendingMessages
  // (messages-dispatch) — mesmo motor que já serve a régua, sem nenhum código duplicado aqui.
  it('clientes elegíveis viram Message PENDING, sem tocar o provider', async () => {
    const channel = await seedActiveDefaultChannel();
    const first = await seedCustomer();
    const second = await db.customer.create({ data: { name: 'Cliente Teste', phone: '+5511998880001', optedOut: false } });
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const summary = await sendManualBatch({
      customerIds: [first.id, second.id],
      body: 'Olá {{cliente.primeiro_nome}}',
      now: IN_HOURS_NOW,
    });

    expect(summary).toEqual({ queued: 2, skippedOptedOut: 0, skippedNoPhone: 0 });
    expect(fetchSpy).not.toHaveBeenCalled();

    const created = await db.message.findMany({ where: { customerId: { in: [first.id, second.id] } } });
    expect(created).toHaveLength(2);
    for (const msg of created) {
      expect(msg.status).toBe('PENDING');
      expect(msg.kind).toBe('MANUAL');
      expect(msg.channelId).toBeNull(); // resolvido no despacho, não no enfileiramento — mesmo padrão de `evaluate.ts`
      expect(msg.scheduledFor).toEqual(IN_HOURS_NOW);
      expect(msg.attempts).toBe(0);
    }
    expect(created.find((m) => m.customerId === first.id)?.body).toBe('Olá Cliente');
    void channel; // canal padrão precisa existir (guarda de capability), mas não é referenciado na Message ainda
  });

  it('mesmo customerId duas vezes na entrada gera uma única Message PENDING', async () => {
    await seedActiveDefaultChannel();
    const customer = await seedCustomer();

    const summary = await sendManualBatch({ customerIds: [customer.id, customer.id], body: 'Olá {{cliente.primeiro_nome}}', now: IN_HOURS_NOW });

    expect(summary.queued).toBe(1);
    const count = await db.message.count({ where: { customerId: customer.id } });
    expect(count).toBe(1);
  });
});
