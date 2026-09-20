import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { saveCustomerWithSubscription } from './customer-onboarding';
import type { CustomerFichaFormValues } from '@/features/customers/ficha-schema';

/**
 * Trocar de plano na ficha não reescreve a cobrança em aberto — ela é
 * congelada na emissão (CLAUDE.md §Dinheiro). O caso relatado: cliente no
 * Trimestral de R$ 90,00 pede o Mensal de R$ 35,00, a assinatura grava certo e
 * a cobrança continua cobrando R$ 90,00 — na tela, no diálogo de pagamento e
 * no WhatsApp.
 *
 * A gravação não decide sozinha: devolve a cobrança que ficou para trás, e a
 * tela pergunta. Reajuste combinado para o próximo ciclo também mexe em
 * `priceCents`, e ali a cobrança corrente está certa — por isso o sinal só sai
 * quando o **plano** muda.
 */

const CUSTOMER_NAME = 'Cliente Troca Plano Ficha';
const PHONE = '+5562991800077';
const OLD_PLAN_NAME = 'Plano Ficha Trimestral';
const NEW_PLAN_NAME = 'Plano Ficha Mensal';

let oldPlanId: string;
let newPlanId: string;
let customerId: string;
let subscriptionId: string;

async function purge() {
  const customers = await db.customer.findMany({
    where: { OR: [{ name: CUSTOMER_NAME }, { phone: PHONE }] },
    select: { id: true },
  });
  const customerIds = customers.map((customer) => customer.id);

  if (customerIds.length > 0) {
    await db.message.deleteMany({ where: { customerId: { in: customerIds } } });
    await db.payment.deleteMany({ where: { charge: { customerId: { in: customerIds } } } });
    await db.charge.deleteMany({ where: { customerId: { in: customerIds } } });
    await db.subscription.deleteMany({ where: { customerId: { in: customerIds } } });
    await db.customer.deleteMany({ where: { id: { in: customerIds } } });
  }
  await db.plan.deleteMany({ where: { name: { in: [OLD_PLAN_NAME, NEW_PLAN_NAME] } } });
}

beforeEach(async () => {
  await purge();

  const oldPlan = await db.plan.create({
    data: { name: OLD_PLAN_NAME, priceCents: 9000n, costCents: 3000n, cycle: 'QUARTERLY' },
  });
  oldPlanId = oldPlan.id;

  const newPlan = await db.plan.create({
    data: { name: NEW_PLAN_NAME, priceCents: 3500n, costCents: 1000n, cycle: 'MONTHLY' },
  });
  newPlanId = newPlan.id;

  const customer = await db.customer.create({ data: { name: CUSTOMER_NAME, phone: PHONE } });
  customerId = customer.id;

  const dueAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
  const subscription = await db.subscription.create({
    data: {
      customerId,
      planId: oldPlanId,
      priceCents: 9000n,
      costCents: 3000n,
      cycle: 'QUARTERLY',
      screens: 1,
      nextDueAt: dueAt,
    },
  });
  subscriptionId = subscription.id;

  await db.charge.create({
    data: {
      subscriptionId,
      customerId,
      principalCents: 9000n,
      discountCents: 0n,
      costCents: 3000n,
      periodStart: new Date('2026-06-27T00:00:00.000Z'),
      periodEnd: new Date('2026-09-25T00:00:00.000Z'),
      dueAt,
    },
  });
});

afterEach(purge);

function fichaValues(overrides: Partial<CustomerFichaFormValues> = {}): CustomerFichaFormValues {
  return {
    name: CUSTOMER_NAME,
    phone: PHONE,
    email: '',
    document: '',
    notes: '',
    planId: newPlanId,
    supplierId: '',
    priceCents: '3500',
    costCents: '1000',
    cycle: 'MONTHLY',
    nextDueAt: '',
    screens: 1,
    status: 'ACTIVE',
    accessUsername: '',
    accessPassword: '',
    ...overrides,
  };
}

function save(values: CustomerFichaFormValues) {
  return saveCustomerWithSubscription({ customerId, subscriptionId, values });
}

describe('saveCustomerWithSubscription — troca de plano com cobrança em aberto', () => {
  it('devolve a cobrança que ficou com o valor do plano anterior', async () => {
    const result = await save(fichaValues());

    expect(result.staleOpenCharge).toEqual({
      chargeId: expect.any(String),
      fromCents: '9000',
      toCents: '3500',
    });
  });

  it('não mexe na cobrança por conta própria — quem decide é o operador', async () => {
    await save(fichaValues());

    const charge = await db.charge.findFirstOrThrow({ where: { subscriptionId } });
    expect(charge.principalCents.toString()).toBe('9000');
  });

  // Documento com dinheiro registrado não se reescreve (CLAUDE.md §Dinheiro).
  // Oferecer o realinhamento aqui seria oferecer um botão que o service recusa.
  it('cobrança com pagamento registrado não vira oferta — o caminho ali é a baixa do restante', async () => {
    const charge = await db.charge.findFirstOrThrow({ where: { subscriptionId } });
    await db.payment.create({
      data: { chargeId: charge.id, amountCents: 3000n, method: 'PIX', paidAt: new Date(), idempotencyKey: randomUUID() },
    });
    await db.charge.update({ where: { id: charge.id }, data: { status: 'PARTIALLY_PAID' } });

    const result = await save(fichaValues());

    expect(result.staleOpenCharge).toBeNull();
  });

  // O reajuste combinado para o próximo ciclo também mexe em `priceCents`, e
  // ali a cobrança corrente está certa — perguntar toda vez treina o operador
  // a clicar "sim" sem ler, e aí o reajuste passa a valer retroativo.
  it('preço editado à mão, sem trocar de plano, não pergunta nada', async () => {
    const result = await save(fichaValues({ planId: oldPlanId, priceCents: '9500', costCents: '3000', cycle: 'QUARTERLY' }));

    expect(result.staleOpenCharge).toBeNull();
  });

  it('plano trocado por outro do mesmo valor não pergunta nada', async () => {
    await db.plan.update({ where: { id: newPlanId }, data: { priceCents: 9000n } });

    const result = await save(fichaValues({ priceCents: '9000' }));

    expect(result.staleOpenCharge).toBeNull();
  });

  it('assinatura sem cobrança em aberto não pergunta nada', async () => {
    await db.charge.deleteMany({ where: { subscriptionId } });

    const result = await save(fichaValues());

    expect(result.staleOpenCharge).toBeNull();
  });
});
