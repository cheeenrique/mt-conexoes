import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { decrypt, encrypt } from '@/lib/crypto';
import {
  anonymizeCustomer,
  CustomerNotAnonymizableError,
  CustomerNotFoundError,
} from './customer-anonymization';

const NAME_PREFIX = 'Anonimização Teste';
const USER_EMAIL = `anonimizacao-teste-${randomUUID()}@exemplo.com`;

let userId: string;

async function purge() {
  await db.message.deleteMany({ where: { customer: { name: { startsWith: NAME_PREFIX } } } });
  await db.lead.deleteMany({ where: { name: { startsWith: NAME_PREFIX } } });
  await db.payment.deleteMany({ where: { charge: { customer: { name: { startsWith: NAME_PREFIX } } } } });
  await db.charge.deleteMany({ where: { customer: { name: { startsWith: NAME_PREFIX } } } });
  await db.subscription.deleteMany({ where: { customer: { name: { startsWith: NAME_PREFIX } } } });
  await db.customer.deleteMany({ where: { name: { startsWith: NAME_PREFIX } } });
  await db.user.deleteMany({ where: { email: USER_EMAIL } });
}

beforeEach(async () => {
  await purge();
  const user = await db.user.create({ data: { email: USER_EMAIL, name: 'Operador Teste', passwordHash: 'x' } });
  userId = user.id;
});
afterEach(purge);

/** Cliente completo — assinatura com credencial, mensagem enviada e lead convertido —
 * sem nada que bloqueie a trava (nenhuma assinatura ACTIVE, nenhuma cobrança em aberto). */
async function buildAnonymizableCustomer(suffix: string) {
  const customer = await db.customer.create({
    data: { name: `${NAME_PREFIX} ${suffix}`, phone: `+551198888000${suffix}`, email: 'titular@exemplo.com', notes: 'nota pessoal' },
  });

  const subscription = await db.subscription.create({
    data: {
      customerId: customer.id,
      priceCents: 10_000n,
      costCents: 3_000n,
      cycle: 'MONTHLY',
      status: 'CANCELLED', // não pode ser ACTIVE — a trava bloquearia
      nextDueAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      accessUsername: 'usuario.secreto',
      accessPasswordEnc: encrypt('senha-secreta', 'subscription.accessPassword'),
      accessServer: 'servidor.exemplo.com',
      accessNotes: 'nota de acesso',
    },
  });

  const charge = await db.charge.create({
    data: {
      subscriptionId: subscription.id,
      customerId: customer.id,
      principalCents: 10_000n,
      periodStart: new Date('2026-07-01T00:00:00Z'),
      periodEnd: new Date('2026-07-31T00:00:00Z'),
      dueAt: new Date('2026-07-31T23:59:59Z'),
      status: 'PAID', // fechada — não conta como "em aberto"
      paidAt: new Date('2026-07-30T12:00:00Z'),
    },
  });
  await db.payment.create({ data: { chargeId: charge.id, amountCents: 10_000n, paidAt: new Date('2026-07-30T12:00:00Z') } });

  const sentMessage = await db.message.create({
    data: {
      customerId: customer.id,
      status: 'SENT',
      toPhone: customer.phone!,
      body: 'Sua renovação de R$ 100,00 vence hoje.',
      scheduledFor: new Date('2026-07-31T12:00:00Z'),
      scheduledDate: new Date('2026-07-31T00:00:00Z'),
    },
  });
  const pendingMessage = await db.message.create({
    data: {
      customerId: customer.id,
      status: 'PENDING',
      toPhone: customer.phone!,
      body: 'Mensagem ainda na fila.',
      scheduledFor: new Date(Date.now() + 60_000),
      scheduledDate: new Date(),
    },
  });

  const lead = await db.lead.create({
    data: {
      name: `${NAME_PREFIX} lead ${suffix}`,
      phone: customer.phone!,
      city: 'Goiânia',
      note: 'observação do lead',
      source: 'site',
      status: 'CONVERTED',
      customerId: customer.id,
    },
  });

  return { customer, subscription, charge, sentMessage, pendingMessage, lead };
}

describe('anonymizeCustomer', () => {
  it('zera os quatro grupos numa transação só, e não toca charges nem payments', async () => {
    const { customer, subscription, charge, sentMessage, pendingMessage, lead } =
      await buildAnonymizableCustomer('1');

    await anonymizeCustomer(customer.id, userId, new Date('2026-08-01T12:00:00Z'));

    const anonymizedCustomer = await db.customer.findUniqueOrThrow({ where: { id: customer.id } });
    expect(anonymizedCustomer.name).toBe('Cliente anonimizado');
    expect(anonymizedCustomer.phone).toBeNull();
    expect(anonymizedCustomer.email).toBeNull();
    expect(anonymizedCustomer.notes).toBeNull();
    expect(anonymizedCustomer.anonymizedAt).toEqual(new Date('2026-08-01T12:00:00Z'));
    expect(anonymizedCustomer.anonymizedByUserId).toBe(userId);

    const anonymizedSub = await db.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
    expect(anonymizedSub.accessUsername).toBeNull();
    expect(anonymizedSub.accessPasswordEnc).toBeNull();
    expect(anonymizedSub.accessServer).toBeNull();
    expect(anonymizedSub.accessNotes).toBeNull();

    const sent = await db.message.findUniqueOrThrow({ where: { id: sentMessage.id } });
    expect(sent.body).toBe('[conteúdo removido a pedido do titular]');
    expect(sent.toPhone).toBe('');
    expect(sent.status).toBe('SENT'); // já enviada — não vira CANCELLED

    const pending = await db.message.findUniqueOrThrow({ where: { id: pendingMessage.id } });
    expect(pending.status).toBe('CANCELLED');
    expect(pending.cancelReason).toBe('customer_anonymized');
    expect(pending.body).toBe('[conteúdo removido a pedido do titular]');

    const anonymizedLead = await db.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(anonymizedLead.name).toBe('Lead anonimizado');
    expect(anonymizedLead.phone).toBe('anonimizado');
    expect(anonymizedLead.city).toBeNull();
    expect(anonymizedLead.note).toBeNull();

    // charges e payments intactos — o relatório do mês não pode mudar.
    const untouchedCharge = await db.charge.findUniqueOrThrow({ where: { id: charge.id } });
    expect(untouchedCharge.principalCents).toBe(10_000n);
    expect(untouchedCharge.status).toBe('PAID');
    const payments = await db.payment.findMany({ where: { chargeId: charge.id } });
    expect(payments).toHaveLength(1);
    expect(payments[0].amountCents).toBe(10_000n);
  });

  it('a senha de acesso criptografada realmente some — decrypt não encontra mais nada pra decifrar', async () => {
    const { customer, subscription } = await buildAnonymizableCustomer('2');
    const before = await db.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
    expect(decrypt(before.accessPasswordEnc!, 'subscription.accessPassword')).toBe('senha-secreta');

    await anonymizeCustomer(customer.id, userId, new Date());

    const after = await db.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
    expect(after.accessPasswordEnc).toBeNull();
  });

  it('rodar duas vezes dá o mesmo resultado — segunda chamada é no-op, não erro', async () => {
    const { customer } = await buildAnonymizableCustomer('3');

    await anonymizeCustomer(customer.id, userId, new Date('2026-08-01T12:00:00Z'));
    const firstPass = await db.customer.findUniqueOrThrow({ where: { id: customer.id } });

    await expect(anonymizeCustomer(customer.id, userId, new Date('2026-08-02T12:00:00Z'))).resolves.toBeUndefined();
    const secondPass = await db.customer.findUniqueOrThrow({ where: { id: customer.id } });

    // carimbo da primeira vez, não da segunda — não regrava por cima.
    expect(secondPass.anonymizedAt).toEqual(firstPass.anonymizedAt);
  });

  it('bloqueia com assinatura ativa, nomeando o que impede', async () => {
    const { customer, subscription } = await buildAnonymizableCustomer('4');
    await db.subscription.update({ where: { id: subscription.id }, data: { status: 'ACTIVE' } });

    await expect(anonymizeCustomer(customer.id, userId, new Date())).rejects.toThrow(
      'Este cliente tem 1 assinatura ativa. Cancele antes de anonimizar.',
    );
    await expect(anonymizeCustomer(customer.id, userId, new Date())).rejects.toThrow(CustomerNotAnonymizableError);

    const untouched = await db.customer.findUniqueOrThrow({ where: { id: customer.id } });
    expect(untouched.anonymizedAt).toBeNull();
    expect(untouched.name).toContain(NAME_PREFIX); // nada foi apagado
  });

  it('bloqueia com cobrança em aberto, nomeando o que impede', async () => {
    const { customer, charge } = await buildAnonymizableCustomer('5');
    await db.charge.update({ where: { id: charge.id }, data: { status: 'OVERDUE', paidAt: null } });

    await expect(anonymizeCustomer(customer.id, userId, new Date())).rejects.toThrow(
      'Este cliente tem 1 cobrança em aberto. Cancele antes de anonimizar.',
    );

    const untouched = await db.customer.findUniqueOrThrow({ where: { id: customer.id } });
    expect(untouched.anonymizedAt).toBeNull();
  });

  it('cliente inexistente recusa com CustomerNotFoundError', async () => {
    await expect(anonymizeCustomer(randomUUID(), userId, new Date())).rejects.toThrow(CustomerNotFoundError);
  });
});
