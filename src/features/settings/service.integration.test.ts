import { afterEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { setSendingPaused } from './service';
import { dispatchPendingMessages } from '@/features/messaging/scheduled-dispatch';

const NOW = new Date('2026-08-08T15:00:00Z'); // 12h em America/Sao_Paulo, dentro de 8-20

afterEach(async () => {
  await db.message.deleteMany({ where: { customer: { name: 'Kill Switch Teste' } } });
  await db.customer.deleteMany({ where: { name: 'Kill Switch Teste' } });
  await db.settings.update({ where: { id: 'singleton' }, data: { sendingPaused: false } });
});

describe('setSendingPaused (T8)', () => {
  it('persiste true e false em Settings.sendingPaused', async () => {
    await setSendingPaused(true);
    expect((await db.settings.findUniqueOrThrow({ where: { id: 'singleton' } })).sendingPaused).toBe(true);

    await setSendingPaused(false);
    expect((await db.settings.findUniqueOrThrow({ where: { id: 'singleton' } })).sendingPaused).toBe(false);
  });

  it('kill switch ligado por aqui já vale na próxima passada do despacho, sem tocar em Message pendente', async () => {
    const customer = await db.customer.create({
      data: { name: 'Kill Switch Teste', phone: '+5511998887777', optedOut: false },
    });
    const msg = await db.message.create({
      data: {
        customerId: customer.id,
        kind: 'DUNNING',
        status: 'PENDING',
        toPhone: '+5511998887777',
        body: 'Olá! Sua cobrança venceu.',
        scheduledFor: NOW,
        scheduledDate: new Date('2026-08-08'),
      },
    });

    await setSendingPaused(true);
    const result = await dispatchPendingMessages(NOW);

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
    const reloaded = await db.message.findUniqueOrThrow({ where: { id: msg.id } });
    expect(reloaded.status).toBe('PENDING');
  });
});
