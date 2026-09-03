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
import { registerPaymentSchema } from './schema';

type RegisterPaymentInput = z.infer<typeof registerPaymentSchema>;

let customerId: string;
let subscriptionId: string;
let chargeId: string;

// Bug real encontrado em 03/09/2026: `dueAt` fixo em '2026-08-31' passou a ficar
// no passado assim que o calendário real cruzou essa data — os testes de
// pagamento parcial (nenhum deles quer testar "vencida", só querem uma
// cobrança em aberto) começaram a receber `deriveChargeStatus` computando
// OVERDUE em vez de PARTIALLY_PAID (core/billing.ts está correto: overdue com
// pagamento parcial É OVERDUE de propósito, ver core/billing.test.ts). Relativo
// a `Date.now()`, nunca mais uma bomba-relógio.
const FUTURE_DUE_AT = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

beforeEach(async () => {
  const customer = await db.customer.create({ data: { name: `Cliente Cobrança ${randomUUID()}` } });
  customerId = customer.id;

  const subscription = await db.subscription.create({
    data: {
      customerId,
      priceCents: 10000n,
      costCents: 3000n,
      cycle: 'MONTHLY',
      nextDueAt: FUTURE_DUE_AT,
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
      dueAt: FUTURE_DUE_AT,
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

describe('registerPaymentSchema', () => {
  it('recusa amountCents "0" na borda Zod, antes do CHECK do banco', () => {
    const result = registerPaymentSchema.safeParse(paymentInput({ amountCents: '0' }));

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('Valor deve ser maior que zero.');
  });
});

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

  it('pagamento de 1 centavo marca PARTIALLY_PAID sem disparar arredondamento indevido', async () => {
    const result = await registerPayment(chargeId, paymentInput({ amountCents: '1' }));

    expect(result.status).toBe('PARTIALLY_PAID');

    const charge = await db.charge.findUniqueOrThrow({ where: { id: chargeId } });
    expect(charge.status).toBe('PARTIALLY_PAID');

    const payments = await db.payment.findMany({ where: { chargeId } });
    expect(payments).toHaveLength(1);
    expect(payments[0].amountCents.toString()).toBe('1');
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
