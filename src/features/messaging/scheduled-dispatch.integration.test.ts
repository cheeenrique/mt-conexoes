import { afterEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { encrypt } from '@/lib/crypto';
import { dispatchPendingMessages } from './scheduled-dispatch';

process.env.CREDENTIAL_KEY = process.env.CREDENTIAL_KEY ?? Buffer.alloc(32, 9).toString('base64');

const IN_HOURS_NOW = new Date('2026-08-08T15:00:00Z'); // 12h em America/Sao_Paulo, dentro de 8-20
const OUT_OF_HOURS_NOW = new Date('2026-08-09T02:00:00Z'); // 23h local (08/08), fora de 8-20

/**
 * `lastCheckAt` por padrão bate exatamente com `IN_HOURS_NOW`: dentro da janela de
 * `HEALTH_CHECK_INTERVAL_MS` (15 min), o healthCheck da frente do despacho não dispara
 * de novo — os testes que só querem exercitar `send()` não precisam mockar a rota de
 * `connectionState` também. Os testes de canal caído passam um `lastCheckAt` próprio.
 */
async function seedActiveDefaultChannel(overrides: { lastCheckOk?: boolean; lastCheckAt?: Date | null } = {}) {
  return db.channelConfig.create({
    data: {
      provider: 'EVOLUTION',
      label: 'Evolution API',
      isActive: true,
      isDefault: true,
      credentials: encrypt(
        JSON.stringify({ baseUrl: 'https://evolution.example.com', apiKey: 'a', instanceName: 'default', webhookToken: 'webhook-token-teste' }),
        'channel.credentials',
      ),
      lastCheckOk: overrides.lastCheckOk ?? true,
      lastCheckAt: overrides.lastCheckAt === undefined ? IN_HOURS_NOW : overrides.lastCheckAt,
    },
  });
}

async function seedCustomer(overrides: { optedOut?: boolean } = {}) {
  return db.customer.create({
    data: { name: 'Dispatch Teste', phone: '+5511998880000', optedOut: overrides.optedOut ?? false },
  });
}

async function seedPendingMessage(
  customerId: string,
  overrides: { createdAt?: Date; scheduledFor?: Date; attempts?: number; scheduledDate?: Date } = {},
) {
  return db.message.create({
    data: {
      customerId,
      kind: 'DUNNING',
      status: 'PENDING',
      toPhone: '+5511998880000',
      body: 'Olá! Sua cobrança venceu.',
      scheduledFor: overrides.scheduledFor ?? IN_HOURS_NOW,
      scheduledDate: overrides.scheduledDate ?? new Date('2026-08-08'),
      createdAt: overrides.createdAt ?? IN_HOURS_NOW,
      attempts: overrides.attempts ?? 0,
    },
  });
}

/** Cria fornecedor+plano+assinatura+cobrança com o status dado, ligada à Message via DunningExecution.
 *  `seq` mantém nome de fornecedor/plano único entre chamadas na mesma suíte. */
async function seedChargeWithExecution(customerId: string, messageId: string, status: 'OPEN' | 'PAID' | 'CANCELLED', seq: number) {
  const supplier = await db.supplier.create({ data: { name: `Fornecedor Dispatch ${seq}`, unitCostCents: 1000n } });
  const plan = await db.plan.create({ data: { name: `Plano Dispatch ${seq}`, priceCents: 6000n, costCents: 1000n, cycle: 'MONTHLY' } });
  const subscription = await db.subscription.create({
    data: {
      customerId, planId: plan.id, supplierId: supplier.id,
      priceCents: 6000n, costCents: 1000n, cycle: 'MONTHLY', status: 'ACTIVE',
      startedAt: IN_HOURS_NOW, nextDueAt: IN_HOURS_NOW,
    },
  });
  const charge = await db.charge.create({
    data: {
      subscriptionId: subscription.id, customerId, supplierId: supplier.id,
      principalCents: 6000n, periodStart: IN_HOURS_NOW, periodEnd: IN_HOURS_NOW, dueAt: IN_HOURS_NOW, status,
    },
  });
  const step = await db.dunningStep.findFirstOrThrow({ where: { rule: { isDefault: true } } });
  await db.dunningExecution.create({ data: { chargeId: charge.id, stepId: step.id, outcome: 'QUEUED', messageId } });
  return charge;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await db.dunningExecution.deleteMany({ where: { charge: { customer: { name: 'Dispatch Teste' } } } });
  await db.message.deleteMany({ where: { customer: { name: 'Dispatch Teste' } } });
  await db.charge.deleteMany({ where: { customer: { name: 'Dispatch Teste' } } });
  await db.subscription.deleteMany({ where: { customer: { name: 'Dispatch Teste' } } });
  await db.customer.deleteMany({ where: { name: 'Dispatch Teste' } });
  await db.plan.deleteMany({ where: { name: { startsWith: 'Plano Dispatch' } } });
  await db.supplier.deleteMany({ where: { name: { startsWith: 'Fornecedor Dispatch' } } });
  await db.channelConfig.deleteMany({ where: { provider: 'EVOLUTION' } });
  await db.settings.update({ where: { id: 'singleton' }, data: { sendingPaused: false } });
});

describe('dispatchPendingMessages', () => {
  it('kill switch pausado: nenhuma Message tocada, contadores zero (T8)', async () => {
    await seedActiveDefaultChannel();
    const customer = await seedCustomer();
    const msg = await seedPendingMessage(customer.id, { createdAt: new Date('2026-08-01T12:00:00Z') }); // seria stale, mas pausado não toca em nada
    await db.settings.update({ where: { id: 'singleton' }, data: { sendingPaused: true } });

    const result = await dispatchPendingMessages(IN_HOURS_NOW);

    expect(result).toEqual({
      sent: 0,
      failed: 0,
      cancelledStale: 0,
      cancelledOptedOut: 0,
      cancelledPaid: 0,
      cancelledDedupe: 0,
      rescheduled: 0,
      blockedChannelDown: 0,
    });
    const reloaded = await db.message.findUnique({ where: { id: msg.id } });
    expect(reloaded?.status).toBe('PENDING');
  });

  it('sem canal padrão ativo: nenhuma Message tocada, sem lançar', async () => {
    const customer = await seedCustomer();
    const msg = await seedPendingMessage(customer.id);

    const result = await dispatchPendingMessages(IN_HOURS_NOW);

    expect(result.sent).toBe(0);
    const reloaded = await db.message.findUnique({ where: { id: msg.id } });
    expect(reloaded?.status).toBe('PENDING');
  });

  it('mensagem com mais de 24h de idade vira CANCELLED, motivo stale', async () => {
    await seedActiveDefaultChannel();
    const customer = await seedCustomer();
    const msg = await seedPendingMessage(customer.id, { createdAt: new Date('2026-08-06T12:00:00Z') }); // >24h antes de IN_HOURS_NOW

    const result = await dispatchPendingMessages(IN_HOURS_NOW);

    expect(result.cancelledStale).toBe(1);
    const reloaded = await db.message.findUnique({ where: { id: msg.id } });
    expect(reloaded?.status).toBe('CANCELLED');
    expect(reloaded?.cancelReason).toBe('stale');
  });

  it('mensagem fora da quiet hour é reagendada pro início da próxima janela, não descartada (T6)', async () => {
    await seedActiveDefaultChannel({ lastCheckAt: OUT_OF_HOURS_NOW });
    const customer = await seedCustomer();
    const msg = await seedPendingMessage(customer.id, {
      createdAt: OUT_OF_HOURS_NOW,
      scheduledFor: OUT_OF_HOURS_NOW,
      scheduledDate: new Date('2026-08-08'),
    });

    const result = await dispatchPendingMessages(OUT_OF_HOURS_NOW);

    expect(result.rescheduled).toBe(1);
    const reloaded = await db.message.findUnique({ where: { id: msg.id } });
    expect(reloaded?.status).toBe('PENDING');
    expect(reloaded?.scheduledFor.toISOString()).toBe(new Date('2026-08-09T11:00:00Z').toISOString()); // 08h local do dia seguinte
    // scheduledDate acompanha o novo dia — é a coluna que sustenta o dedupe diário (T7).
    expect(reloaded?.scheduledDate.toISOString()).toBe(new Date('2026-08-09').toISOString());
  });

  it('reagendamento por T6 que colide com Message já existente no novo dia cancela a mensagem de hoje, motivo daily_dedupe (T7)', async () => {
    await seedActiveDefaultChannel({ lastCheckAt: OUT_OF_HOURS_NOW });
    const customer = await seedCustomer();
    const msg = await seedPendingMessage(customer.id, {
      createdAt: OUT_OF_HOURS_NOW,
      scheduledFor: OUT_OF_HOURS_NOW,
      scheduledDate: new Date('2026-08-08'),
    });
    // já ocupa o slot diário do customer pro dia alvo do reagendamento (2026-08-09) —
    // scheduledFor no futuro distante pra não entrar no lote desta passada.
    await seedPendingMessage(customer.id, {
      createdAt: OUT_OF_HOURS_NOW,
      scheduledFor: new Date('2026-08-20T11:00:00Z'),
      scheduledDate: new Date('2026-08-09'),
    });

    const result = await dispatchPendingMessages(OUT_OF_HOURS_NOW);

    expect(result.rescheduled).toBe(0);
    expect(result.cancelledDedupe).toBe(1);
    const reloaded = await db.message.findUnique({ where: { id: msg.id } });
    expect(reloaded?.status).toBe('CANCELLED');
    expect(reloaded?.cancelReason).toBe('daily_dedupe');
  });

  it('customer.optedOut cancela o envio, motivo opted_out (T5)', async () => {
    await seedActiveDefaultChannel();
    const customer = await seedCustomer({ optedOut: true });
    const msg = await seedPendingMessage(customer.id);

    const result = await dispatchPendingMessages(IN_HOURS_NOW);

    expect(result.cancelledOptedOut).toBe(1);
    const reloaded = await db.message.findUnique({ where: { id: msg.id } });
    expect(reloaded?.status).toBe('CANCELLED');
    expect(reloaded?.cancelReason).toBe('opted_out');
  });

  it('mensagem com única cobrança ligada já paga é cancelada, motivo charge_closed', async () => {
    await seedActiveDefaultChannel();
    const customer = await seedCustomer();
    const msg = await seedPendingMessage(customer.id);
    await seedChargeWithExecution(customer.id, msg.id, 'PAID', 1);

    const result = await dispatchPendingMessages(IN_HOURS_NOW);

    expect(result.cancelledPaid).toBe(1);
    const reloaded = await db.message.findUnique({ where: { id: msg.id } });
    expect(reloaded?.status).toBe('CANCELLED');
    expect(reloaded?.cancelReason).toBe('charge_closed');
  });

  it('mensagem consolidada com uma cobrança paga e outra ainda aberta NÃO cancela, tenta enviar', async () => {
    await seedActiveDefaultChannel();
    const customer = await seedCustomer();
    const msg = await seedPendingMessage(customer.id);
    await seedChargeWithExecution(customer.id, msg.id, 'PAID', 2);
    await seedChargeWithExecution(customer.id, msg.id, 'OPEN', 3);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ key: { id: 'wamid1' } }) }));

    const result = await dispatchPendingMessages(IN_HOURS_NOW);

    expect(result.cancelledPaid).toBe(0);
    expect(result.sent).toBe(1);
  });

  it('envio com sucesso: SENT, sentAt, externalId e channelId gravados', async () => {
    const channel = await seedActiveDefaultChannel();
    const customer = await seedCustomer();
    const msg = await seedPendingMessage(customer.id);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ key: { id: 'wamid-ok' } }) }));

    const result = await dispatchPendingMessages(IN_HOURS_NOW);

    expect(result.sent).toBe(1);
    const reloaded = await db.message.findUnique({ where: { id: msg.id } });
    expect(reloaded?.status).toBe('SENT');
    expect(reloaded?.externalId).toBe('wamid-ok');
    expect(reloaded?.channelId).toBe(channel.id);
    expect(reloaded?.sentAt).not.toBeNull();
  });

  it('claim atômico previne double-send em duas execuções concorrentes do cron', async () => {
    const channel = await seedActiveDefaultChannel();
    const customer = await seedCustomer();
    const msg = await seedPendingMessage(customer.id);
    const send = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ key: { id: 'wamid-race' } }) });
    vi.stubGlobal('fetch', send);

    const [resultA, resultB] = await Promise.all([
      dispatchPendingMessages(IN_HOURS_NOW),
      dispatchPendingMessages(IN_HOURS_NOW),
    ]);

    expect(resultA.sent + resultB.sent).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
    const reloaded = await db.message.findUnique({ where: { id: msg.id } });
    expect(reloaded?.status).toBe('SENT');
    expect(reloaded?.attempts).toBe(1);
    expect(reloaded?.channelId).toBe(channel.id);
  });

  it('falha retryable incrementa attempts; na terceira tentativa vira FAILED', async () => {
    await seedActiveDefaultChannel();
    const customer = await seedCustomer();
    const msg = await seedPendingMessage(customer.id, { attempts: 2 });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ message: 'fora do ar' }) }));

    const result = await dispatchPendingMessages(IN_HOURS_NOW);

    expect(result.failed).toBe(1);
    const reloaded = await db.message.findUnique({ where: { id: msg.id } });
    expect(reloaded?.status).toBe('FAILED');
    expect(reloaded?.attempts).toBe(3);
    expect(reloaded?.failReason).toBe('fora do ar');
  });

  it('falha retryable antes da terceira tentativa mantém PENDING pra próxima passada', async () => {
    await seedActiveDefaultChannel();
    const customer = await seedCustomer();
    const msg = await seedPendingMessage(customer.id, { attempts: 0 });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ message: 'fora do ar' }) }));

    const result = await dispatchPendingMessages(IN_HOURS_NOW);

    expect(result.failed).toBe(0);
    expect(result.sent).toBe(0);
    const reloaded = await db.message.findUnique({ where: { id: msg.id } });
    expect(reloaded?.status).toBe('PENDING');
    expect(reloaded?.attempts).toBe(1);
  });

  it('falha não-retryable vira FAILED na primeira tentativa, sem gastar as 3 rodadas', async () => {
    await seedActiveDefaultChannel();
    const customer = await seedCustomer();
    const msg = await seedPendingMessage(customer.id, { attempts: 0 });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ message: 'número inválido' }) }));

    const result = await dispatchPendingMessages(IN_HOURS_NOW);

    expect(result.failed).toBe(1);
    const reloaded = await db.message.findUnique({ where: { id: msg.id } });
    expect(reloaded?.status).toBe('FAILED');
    expect(reloaded?.attempts).toBe(1);
  });

  it('respeita o lote de 60 e a ordem de criação', async () => {
    await seedActiveDefaultChannel();
    const customer = await seedCustomer();
    // scheduledDate varia por mensagem: T7 (messages_dunning_daily_dedupe) permite só uma
    // DUNNING pendente por customer/dia — aqui o alvo é testar o corte do lote, não o dedupe diário.
    for (let i = 0; i < 65; i++) {
      await seedPendingMessage(customer.id, {
        createdAt: new Date(IN_HOURS_NOW.getTime() + i * 1000),
        scheduledDate: new Date(Date.UTC(2026, 7, 8 + i)),
      });
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ key: { id: 'wamid-batch' } }) }));

    const result = await dispatchPendingMessages(IN_HOURS_NOW);

    expect(result.sent).toBe(60);
    const stillPending = await db.message.count({ where: { customerId: customer.id, status: 'PENDING' } });
    expect(stillPending).toBe(5);
  });

  describe('canal padrão fora do ar — não envia e não queima a mensagem', () => {
    /** Responde diferente por endpoint: `/instance/connectionState/` (healthCheck) vs
     *  `/message/sendText/` (send). Necessário porque a frente do despacho agora chama
     *  os dois na mesma passada quando o healthCheck está vencido. */
    function stubFetchByEndpoint(opts: { connectionState: 'open' | 'close'; sendOk?: boolean }) {
      const fetchMock = vi.fn(async (url: string) => {
        if (url.includes('/instance/connectionState/')) {
          return { ok: true, status: 200, json: async () => ({ instance: { state: opts.connectionState } }) };
        }
        if (url.includes('/message/sendText/')) {
          return opts.sendOk === false
            ? { ok: false, status: 500, json: async () => ({ message: 'falhou' }) }
            : { ok: true, status: 200, json: async () => ({ key: { id: 'wamid-health' } }) };
        }
        throw new Error(`fetch inesperado neste teste: ${url}`);
      });
      vi.stubGlobal('fetch', fetchMock);
      return fetchMock;
    }

    it('lastCheckOk=false (já conhecido, dentro da janela de 15min): não tenta enviar, mensagem continua PENDING, conta blockedChannelDown', async () => {
      await seedActiveDefaultChannel({ lastCheckOk: false, lastCheckAt: IN_HOURS_NOW });
      const customer = await seedCustomer();
      const msg = await seedPendingMessage(customer.id);
      const fetchMock = vi.fn().mockRejectedValue(new Error('não deveria chamar fetch com o canal marcado como caído'));
      vi.stubGlobal('fetch', fetchMock);

      const result = await dispatchPendingMessages(IN_HOURS_NOW);

      expect(result.blockedChannelDown).toBe(1);
      expect(result.sent).toBe(0);
      expect(result.failed).toBe(0);
      expect(fetchMock).not.toHaveBeenCalled();
      const reloaded = await db.message.findUnique({ where: { id: msg.id } });
      expect(reloaded?.status).toBe('PENDING');
      expect(reloaded?.attempts).toBe(0);
    });

    it('mensagem stale (>24h) continua sendo cancelada mesmo com o canal caído — T8 age antes do bloqueio', async () => {
      await seedActiveDefaultChannel({ lastCheckOk: false, lastCheckAt: IN_HOURS_NOW });
      const customer = await seedCustomer();
      const msg = await seedPendingMessage(customer.id, { createdAt: new Date('2026-08-06T12:00:00Z') }); // >24h antes de IN_HOURS_NOW
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('não deveria chamar fetch')));

      const result = await dispatchPendingMessages(IN_HOURS_NOW);

      expect(result.cancelledStale).toBe(1);
      expect(result.blockedChannelDown).toBe(0);
      const reloaded = await db.message.findUnique({ where: { id: msg.id } });
      expect(reloaded?.status).toBe('CANCELLED');
      expect(reloaded?.cancelReason).toBe('stale');
    });

    it('healthCheck vencido (lastCheckAt null): roda antes do lote, marca o canal caído e bloqueia — sem cron novo, na frente da própria passada', async () => {
      const channel = await seedActiveDefaultChannel({ lastCheckOk: true, lastCheckAt: null });
      const customer = await seedCustomer();
      const msg = await seedPendingMessage(customer.id);
      const fetchMock = stubFetchByEndpoint({ connectionState: 'close' });

      const result = await dispatchPendingMessages(IN_HOURS_NOW);

      expect(result.blockedChannelDown).toBe(1);
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/instance/connectionState/'), expect.anything());
      expect(fetchMock.mock.calls.some(([url]: [string]) => url.includes('/message/sendText/'))).toBe(false);
      const reloadedMsg = await db.message.findUnique({ where: { id: msg.id } });
      expect(reloadedMsg?.status).toBe('PENDING');
      const reloadedChannel = await db.channelConfig.findUniqueOrThrow({ where: { id: channel.id } });
      expect(reloadedChannel.lastCheckOk).toBe(false);
      expect(reloadedChannel.lastCheckAt?.toISOString()).toBe(IN_HOURS_NOW.toISOString());
    });

    it('healthCheck vencido confirma canal saudável: despacho segue normalmente e persiste lastCheckOk=true', async () => {
      const channel = await seedActiveDefaultChannel({ lastCheckOk: false, lastCheckAt: null });
      const customer = await seedCustomer();
      const msg = await seedPendingMessage(customer.id);
      stubFetchByEndpoint({ connectionState: 'open', sendOk: true });

      const result = await dispatchPendingMessages(IN_HOURS_NOW);

      expect(result.blockedChannelDown).toBe(0);
      expect(result.sent).toBe(1);
      const reloadedMsg = await db.message.findUnique({ where: { id: msg.id } });
      expect(reloadedMsg?.status).toBe('SENT');
      const reloadedChannel = await db.channelConfig.findUniqueOrThrow({ where: { id: channel.id } });
      expect(reloadedChannel.lastCheckOk).toBe(true);
    });
  });
});
