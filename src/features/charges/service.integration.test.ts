import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  registerPayment,
  writeOffRemaining,
  realignChargeToSubscription,
  cancelCharge,
  ChargeHasPaymentError as _ChargeHasPaymentError,
  ChargeWithoutPaymentError,
  ChargeAlreadyPaidError,
  ChargeHasPaymentError,
  ChargeNotFoundError,
  PaymentDateInFutureError,
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

  it('recusa data que o formato aceita mas o calendário não tem', () => {
    const result = registerPaymentSchema.safeParse(paymentInput({ paidAt: '2026-02-31' }));

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('Data do pagamento inválida.');
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

  it('pagamento registrado com atraso conta o ciclo a partir do dia em que o cliente pagou', async () => {
    // O cliente pagou 01/09 e o operador só registrou dias depois: o próximo
    // vencimento é 01/10, contado do dia do pagamento, nunca do dia do registro.
    const result = await registerPayment(chargeId, paymentInput({ amountCents: '10000', paidAt: '2026-09-01' }));

    expect(result.status).toBe('PAID');

    const charge = await db.charge.findUniqueOrThrow({ where: { id: chargeId } });
    expect(charge.paidAt?.toISOString()).toBe('2026-09-01T03:00:00.000Z');

    const nextCharge = await db.charge.findFirstOrThrow({ where: { subscriptionId, id: { not: chargeId } } });
    expect(nextCharge.dueAt.toISOString()).toBe('2026-10-02T02:59:59.999Z');

    const subscription = await db.subscription.findUniqueOrThrow({ where: { id: subscriptionId } });
    expect(subscription.nextDueAt.toISOString()).toBe('2026-10-02T02:59:59.999Z');
  });

  it('data de pagamento no futuro é recusada e não grava Payment', async () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    await expect(registerPayment(chargeId, paymentInput({ paidAt: tomorrow }))).rejects.toThrow(PaymentDateInFutureError);

    const payments = await db.payment.findMany({ where: { chargeId } });
    expect(payments).toHaveLength(0);
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

/**
 * Relatado em 11/09/2026: "renovei ele e está com a situação suspensa". A régua
 * corta o acesso com o passo SUSPEND, e quitar a cobrança que motivou o corte
 * era a única coisa que não desfazia o corte — o cliente renovado seguia
 * `Suspenso` na lista, cinza, fora de todos os degraus da escada de vencimento
 * (`situationWhere` exige assinatura ACTIVE) e fora dos contadores da triagem.
 */
describe('registerPayment — assinatura suspensa pela régua', () => {
  beforeEach(async () => {
    await db.subscription.update({
      where: { id: subscriptionId },
      data: { status: 'SUSPENDED', suspendedAt: new Date('2026-08-01T12:00:00.000Z') },
    });
  });

  it('pagamento total reativa a assinatura e apaga a data de suspensão', async () => {
    await registerPayment(chargeId, paymentInput({ amountCents: '10000', paidAt: '2026-08-31' }));

    const subscription = await db.subscription.findUniqueOrThrow({ where: { id: subscriptionId } });
    expect(subscription.status).toBe('ACTIVE');
    expect(subscription.suspendedAt).toBeNull();
  });

  it('pagamento parcial não reativa — o acesso volta quando o saldo zera, não antes', async () => {
    await registerPayment(chargeId, paymentInput({ amountCents: '4000' }));

    const subscription = await db.subscription.findUniqueOrThrow({ where: { id: subscriptionId } });
    expect(subscription.status).toBe('SUSPENDED');
  });
});


/**
 * Relatado em 11/09/2026: cliente de R$ 90 (trimestral) que decidiu ficar só no
 * mensal e pagou R$ 30. A cobrança fica devendo 60 para sempre — cancelar é
 * proibido (tem pagamento) e editar o valor também (documento com dinheiro
 * registrado é imutável, CLAUDE.md §Dinheiro). Não havia saída pela tela.
 *
 * A saída é a que o domínio já tem: o que não vai ser cobrado vira desconto na
 * própria cobrança. O dinheiro recebido não se reescreve, o faturado cai para o
 * que foi de fato acordado, e o ciclo seguinte abre contado do dia do pagamento.
 */
describe('writeOffRemaining — baixa do restante como desconto', () => {
  it('fecha a cobrança com o que já foi pago e joga a diferença para o desconto', async () => {
    await registerPayment(chargeId, paymentInput({ amountCents: '3000', paidAt: '2026-08-31' }));

    const result = await writeOffRemaining(chargeId);

    expect(result.status).toBe('PAID');
    const charge = await db.charge.findUniqueOrThrow({ where: { id: chargeId } });
    expect(charge.status).toBe('PAID');
    expect(charge.discountCents.toString()).toBe('7000');
    expect(charge.principalCents.toString()).toBe('10000');
    // Custo congelado na emissão: a baixa é decisão comercial, não erro de custo.
    expect(charge.costCents.toString()).toBe('3000');
    expect(charge.paidAt?.toISOString()).toBe('2026-08-31T03:00:00.000Z');
  });

  it('abre o ciclo seguinte contado do dia em que o cliente pagou', async () => {
    await registerPayment(chargeId, paymentInput({ amountCents: '3000', paidAt: '2026-08-31' }));

    await writeOffRemaining(chargeId);

    const next = await db.charge.findFirstOrThrow({ where: { subscriptionId, id: { not: chargeId } } });
    expect(next.dueAt.toISOString()).toBe('2026-10-01T02:59:59.999Z');
    // Preço do ciclo novo sai da assinatura, não do que sobrou da baixa.
    expect(next.principalCents.toString()).toBe('10000');

    const subscription = await db.subscription.findUniqueOrThrow({ where: { id: subscriptionId } });
    expect(subscription.nextDueAt.toISOString()).toBe('2026-10-01T02:59:59.999Z');
  });

  it('religa a assinatura que a régua tinha cortado', async () => {
    await db.subscription.update({ where: { id: subscriptionId }, data: { status: 'SUSPENDED', suspendedAt: new Date() } });
    await registerPayment(chargeId, paymentInput({ amountCents: '3000', paidAt: '2026-08-31' }));

    await writeOffRemaining(chargeId);

    const subscription = await db.subscription.findUniqueOrThrow({ where: { id: subscriptionId } });
    expect(subscription.status).toBe('ACTIVE');
    expect(subscription.suspendedAt).toBeNull();
  });

  it('cobrança sem pagamento nenhum é recusada — aí o caminho é cancelar', async () => {
    await expect(writeOffRemaining(chargeId)).rejects.toThrow(ChargeWithoutPaymentError);

    const charge = await db.charge.findUniqueOrThrow({ where: { id: chargeId } });
    expect(charge.discountCents.toString()).toBe('0');
  });

  it('cobrança já paga é recusada', async () => {
    await registerPayment(chargeId, paymentInput({ amountCents: '10000' }));

    await expect(writeOffRemaining(chargeId)).rejects.toThrow(ChargeAlreadyPaidError);
  });

  it('cobrança cancelada é recusada', async () => {
    await cancelCharge(chargeId, 'cliente desistiu');

    await expect(writeOffRemaining(chargeId)).rejects.toThrow(ChargeNotFoundError);
  });
});


/**
 * Relatado em 11/09/2026: cliente de trimestral R$ 90 que virou mensal R$ 30. O
 * operador troca o plano e a cobrança em aberto continua com o valor velho —
 * é ela que a régua manda por WhatsApp e que a lista de Cobranças mostra.
 *
 * Não pode ser automático na troca de plano: reajuste combinado para o
 * próximo ciclo também mexe em `priceCents`, e ali a cobrança corrente está
 * certa. Por isso é ação explícita, com o valor velho e o novo na frente do
 * operador.
 */
describe('realignChargeToSubscription — trazer o valor do plano para a cobrança', () => {
  it('traz preço, custo e desconto da assinatura para a cobrança em aberto', async () => {
    await db.subscription.update({ where: { id: subscriptionId }, data: { priceCents: 3000n, costCents: 900n } });

    await realignChargeToSubscription(chargeId);

    const charge = await db.charge.findUniqueOrThrow({ where: { id: chargeId } });
    expect(charge.principalCents.toString()).toBe('3000');
    expect(charge.costCents.toString()).toBe('900');
    expect(charge.discountCents.toString()).toBe('0');
  });

  it('aplica o desconto vigente da assinatura', async () => {
    await db.subscription.update({
      where: { id: subscriptionId },
      data: { priceCents: 3000n, costCents: 900n, discountType: 'PERCENT', discountValue: '10' },
    });

    await realignChargeToSubscription(chargeId);

    const charge = await db.charge.findUniqueOrThrow({ where: { id: chargeId } });
    expect(charge.discountCents.toString()).toBe('300');
  });

  it('recalcula o status contra o vencimento, sem esperar o cron', async () => {
    await db.charge.update({ where: { id: chargeId }, data: { status: 'OVERDUE' } });
    await db.subscription.update({ where: { id: subscriptionId }, data: { priceCents: 3000n } });

    await realignChargeToSubscription(chargeId);

    // FUTURE_DUE_AT está 30 dias à frente: vencida por engano volta a aberta.
    const charge = await db.charge.findUniqueOrThrow({ where: { id: chargeId } });
    expect(charge.status).toBe('OPEN');
  });

  it('cobrança com pagamento registrado é recusada — documento com dinheiro não se reescreve', async () => {
    await registerPayment(chargeId, paymentInput({ amountCents: '3000' }));
    await db.subscription.update({ where: { id: subscriptionId }, data: { priceCents: 3000n } });

    await expect(realignChargeToSubscription(chargeId)).rejects.toThrow(_ChargeHasPaymentError);

    const charge = await db.charge.findUniqueOrThrow({ where: { id: chargeId } });
    expect(charge.principalCents.toString()).toBe('10000');
  });

  it('cobrança paga ou cancelada é recusada', async () => {
    await cancelCharge(chargeId, 'cliente desistiu');
    await expect(realignChargeToSubscription(chargeId)).rejects.toThrow(ChargeNotFoundError);
  });
});
