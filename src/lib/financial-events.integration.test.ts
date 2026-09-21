import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { recordFinancialEvent, listFinancialEvents } from './financial-events';

const CUSTOMER_NAME = 'Cliente Log Financeiro';

let customerId: string;

beforeEach(async () => {
  const customer = await db.customer.create({ data: { name: CUSTOMER_NAME } });
  customerId = customer.id;
});

afterEach(async () => {
  await db.financialEvent.deleteMany({ where: { customerId } });
  await db.customer.deleteMany({ where: { id: customerId } });
});

describe('recordFinancialEvent', () => {
  it('grava o evento com o payload que recebeu', async () => {
    await db.$transaction((tx) =>
      recordFinancialEvent(tx, {
        customerId,
        entityType: 'SUBSCRIPTION',
        entityId: 'assinatura-1',
        kind: 'SUBSCRIPTION_PRICE_EDITED',
        before: { priceCents: '9000', costCents: '3000' },
        after: { priceCents: '3500', costCents: '1000' },
        reason: 'cliente renegociou',
      }),
    );

    const events = await listFinancialEvents(customerId);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('SUBSCRIPTION_PRICE_EDITED');
    expect(events[0].before).toEqual({ priceCents: '9000', costCents: '3000' });
    expect(events[0].after).toEqual({ priceCents: '3500', costCents: '1000' });
    expect(events[0].reason).toBe('cliente renegociou');
  });

  // O evento é o único lugar onde o pagamento removido continua existindo.
  // Se ele puder sobreviver a um rollback da mutação, o log passa a afirmar
  // coisas que não aconteceram.
  it('rollback da transação não deixa evento órfão', async () => {
    await expect(
      db.$transaction(async (tx) => {
        await recordFinancialEvent(tx, {
          customerId,
          entityType: 'CHARGE',
          entityId: 'cobranca-1',
          kind: 'CHARGE_CANCELLED',
        });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(await listFinancialEvents(customerId)).toHaveLength(0);
  });

  it('devolve do mais recente para o mais antigo', async () => {
    await db.$transaction(async (tx) => {
      await recordFinancialEvent(tx, { customerId, entityType: 'CHARGE', entityId: 'c1', kind: 'CHARGE_CANCELLED' });
      await recordFinancialEvent(tx, { customerId, entityType: 'CHARGE', entityId: 'c2', kind: 'CHARGE_REALIGNED' });
    });

    const events = await listFinancialEvents(customerId);
    expect(events.map((event) => event.kind)).toEqual(['CHARGE_REALIGNED', 'CHARGE_CANCELLED']);
  });
});
