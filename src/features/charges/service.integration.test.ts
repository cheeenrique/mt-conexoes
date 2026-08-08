import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  registerPayment,
  cancelCharge,
  ChargeAlreadyPaidError,
  ChargeHasPaymentError,
  ChargeNotFoundError,
  PaymentExceedsBalanceError,
} from './service';
import type { z } from 'zod';
import type { registerPaymentSchema } from './schema';

type RegisterPaymentInput = z.infer<typeof registerPaymentSchema>;

let customerId: string;
let subscriptionId: string;
let chargeId: string;

beforeEach(async () => {
  const customer = await db.customer.create({ data: { name: `Cliente Cobrança ${randomUUID()}` } });
  customerId = customer.id;

  const subscription = await db.subscription.create({
    data: {
      customerId,
      priceCents: 10000n,
      costCents: 3000n,
      cycle: 'MONTHLY',
      nextDueAt: new Date('2026-08-31T23:59:59.000Z'),
    },
  });
  subscriptionId = subscription.id;

  const charge = await db.charge.create({
    data: {
      subscriptionId,
      customerId,
      principalCents: 10000n,
      discountCents: 0n,
      costCents: 3000n,
      periodStart: new Date('2026-07-31T00:00:00.000Z'),
      periodEnd: new Date('2026-08-31T00:00:00.000Z'),
      dueAt: new Date('2026-08-31T23:59:59.000Z'),
    },
  });
  chargeId = charge.id;
});

afterEach(async () => {
  await db.payment.deleteMany({ where: { charge: { subscriptionId } } });
  await db.charge.deleteMany({ where: { subscriptionId } });
  await db.subscription.deleteMany({ where: { id: subscriptionId } });
  await db.customer.deleteMany({ where: { id: customerId } });
});

function paymentInput(overrides: Partial<RegisterPaymentInput> = {}): RegisterPaymentInput {
  return {
    amountCents: '10000',
    method: 'PIX',
    paidAt: '2026-08-31',
    idempotencyKey: randomUUID(),
    ...overrides,
  };
}

describe('registerPayment', () => {
  it('pagamento total marca PAID e emite a próxima Charge com vencimento certo', async () => {
    const result = await registerPayment(chargeId, paymentInput({ amountCents: '10000', paidAt: '2026-08-31' }));

    expect(result.status).toBe('PAID');

    const charge = await db.charge.findUniqueOrThrow({ where: { id: chargeId } });
    expect(charge.status).toBe('PAID');
    expect(charge.paidAt).not.toBeNull();

    // Pagou 31/08 -> próximo vencimento cai em setembro, que só tem 30 dias:
    // clamp de fim de mês.
    const nextCharge = await db.charge.findFirst({
      where: { subscriptionId, id: { not: chargeId } },
    });
    expect(nextCharge).not.toBeNull();
    expect(nextCharge!.dueAt.toISOString()).toBe('2026-10-01T02:59:59.999Z');
    expect(nextCharge!.periodEnd.toISOString()).toBe('2026-09-30T00:00:00.000Z');

    const subscription = await db.subscription.findUniqueOrThrow({ where: { id: subscriptionId } });
    expect(subscription.nextDueAt.toISOString()).toBe('2026-10-01T02:59:59.999Z');
  });

  it('pagamento parcial marca PARTIALLY_PAID e não emite próxima Charge', async () => {
    const result = await registerPayment(chargeId, paymentInput({ amountCents: '4000' }));

    expect(result.status).toBe('PARTIALLY_PAID');

    const charge = await db.charge.findUniqueOrThrow({ where: { id: chargeId } });
    expect(charge.status).toBe('PARTIALLY_PAID');

    const otherCharges = await db.charge.findMany({ where: { subscriptionId, id: { not: chargeId } } });
    expect(otherCharges).toHaveLength(0);
  });

  it('duas tentativas com a mesma idempotencyKey não duplicam o Payment', async () => {
    const input = paymentInput({ amountCents: '4000' });

    await registerPayment(chargeId, input);
    await registerPayment(chargeId, input);

    const payments = await db.payment.findMany({ where: { chargeId } });
    expect(payments).toHaveLength(1);

    const charge = await db.charge.findUniqueOrThrow({ where: { id: chargeId } });
    expect(charge.status).toBe('PARTIALLY_PAID');
  });

  it('pagamento acima do saldo devedor é recusado com PaymentExceedsBalanceError', async () => {
    await expect(registerPayment(chargeId, paymentInput({ amountCents: '10001' }))).rejects.toThrow(PaymentExceedsBalanceError);

    const payments = await db.payment.findMany({ where: { chargeId } });
    expect(payments).toHaveLength(0);
  });

  it('cobrança já paga recusa novo pagamento com ChargeAlreadyPaidError', async () => {
    await registerPayment(chargeId, paymentInput({ amountCents: '10000' }));

    await expect(registerPayment(chargeId, paymentInput({ amountCents: '10000' }))).rejects.toThrow(ChargeAlreadyPaidError);
  });

  it('cobrança inexistente recusa pagamento com ChargeNotFoundError', async () => {
    await expect(registerPayment(randomUUID(), paymentInput())).rejects.toThrow(ChargeNotFoundError);
  });
});

describe('cancelCharge', () => {
  it('cobrança com pagamento registrado não pode ser cancelada', async () => {
    await registerPayment(chargeId, paymentInput({ amountCents: '4000' }));

    await expect(cancelCharge(chargeId, 'cliente desistiu')).rejects.toThrow(ChargeHasPaymentError);

    const charge = await db.charge.findUniqueOrThrow({ where: { id: chargeId } });
    expect(charge.status).toBe('PARTIALLY_PAID');
  });

  it('cobrança sem pagamento pode ser cancelada e não conta mais como aberta', async () => {
    await cancelCharge(chargeId, 'cliente desistiu');

    const charge = await db.charge.findUniqueOrThrow({ where: { id: chargeId } });
    expect(charge.status).toBe('CANCELLED');
    expect(charge.cancelReason).toBe('cliente desistiu');
    expect(charge.cancelledAt).not.toBeNull();

    const openCharges = await db.charge.findMany({ where: { subscriptionId, status: { in: ['OPEN', 'OVERDUE', 'PARTIALLY_PAID'] } } });
    expect(openCharges).toHaveLength(0);
  });

  it('cobrança inexistente recusa cancelamento com ChargeNotFoundError', async () => {
    await expect(cancelCharge(randomUUID(), 'motivo')).rejects.toThrow(ChargeNotFoundError);
  });
});
