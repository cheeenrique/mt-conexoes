import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { encrypt } from '@/lib/crypto';
import {
  createSubscription,
  revealCredential,
  changeSubscriptionPlan,
  SubscriptionNotFoundError,
  SubscriptionCancelledError,
  PlanNotFoundError,
} from './service';
import type { subscriptionSchema } from './schema';
import type { z } from 'zod';

const CUSTOMER_PHONE = '+5511999990001';

let customerId: string;
let subscriptionId: string;
let userId: string;

beforeEach(async () => {
  const customer = await db.customer.create({ data: { name: 'Teste Revelar', phone: CUSTOMER_PHONE } });
  customerId = customer.id;

  const subscription = await db.subscription.create({
    data: {
      customerId,
      priceCents: 1000n,
      nextDueAt: new Date(),
      accessUsername: 'joao.silva',
      accessPasswordEnc: encrypt('senha-real-123', 'subscription.accessPassword'),
    },
  });
  subscriptionId = subscription.id;

  const user = await db.user.create({
    data: { email: `reveal-test-${randomUUID()}@mtconexoes.com.br`, name: 'Teste', passwordHash: 'x' },
  });
  userId = user.id;
});

afterEach(async () => {
  await db.credentialReveal.deleteMany({ where: { subscriptionId } });
  await db.subscription.deleteMany({ where: { customerId } });
  await db.customer.deleteMany({ where: { id: customerId } });
  await db.user.deleteMany({ where: { id: userId } });
});

describe('revealCredential', () => {
  it('grava CredentialReveal antes de devolver o valor decriptado', async () => {
    const value = await revealCredential(subscriptionId, userId, '127.0.0.1');
    expect(value).toBe('senha-real-123');

    const reveals = await db.credentialReveal.findMany({ where: { subscriptionId } });
    expect(reveals).toHaveLength(1);
    expect(reveals[0].userId).toBe(userId);
  });

  it('cada chamada grava uma auditoria nova, não deduplica', async () => {
    await revealCredential(subscriptionId, userId, '127.0.0.1');
    await revealCredential(subscriptionId, userId, '127.0.0.1');

    const reveals = await db.credentialReveal.findMany({ where: { subscriptionId } });
    expect(reveals).toHaveLength(2);
  });

  // Esse teste discrimina a ORDEM de verdade: o ciphertext corrompido faz o
  // decrypt falhar depois que a auditoria já deveria ter sido gravada. Se a
  // implementação inverter a ordem (decrypt antes do `create`), a exceção
  // interrompe a função antes de gravar nada e este teste fica vermelho — os
  // dois testes acima passariam de qualquer jeito, com a ordem certa ou
  // errada, porque só conferem o estado final.
  it('grava a auditoria mesmo quando o decrypt falha depois', async () => {
    await db.subscription.update({ where: { id: subscriptionId }, data: { accessPasswordEnc: 'v1:AAAA:AAAA:AAAA' } });

    await expect(revealCredential(subscriptionId, userId, '127.0.0.1')).rejects.toThrow();

    const reveals = await db.credentialReveal.findMany({ where: { subscriptionId } });
    expect(reveals).toHaveLength(1);
  });
});

describe('createSubscription — defesa em profundidade de discountUntil', () => {
  // O schema Zod já bloqueia isso antes de chegar aqui (ver schema.test.ts).
  // Este teste simula um caller que ignorou o schema — `as unknown as` força
  // o TypeScript a aceitar o payload inválido — pra provar que o service
  // também recusa, em vez de deixar `Invalid Date` vazar pro Prisma e virar
  // um PrismaClientValidationError com os outros argumentos da chamada
  // (accessPasswordEnc incluso) ecoados na mensagem de erro.
  it('rejeita discountUntil não-data com erro explícito, não deixa Invalid Date chegar no Prisma', async () => {
    const input = {
      priceCents: '1000',
      costCents: '500',
      cycle: 'MONTHLY',
      screens: 1,
      discountUntil: 'abc',
    } as unknown as z.infer<typeof subscriptionSchema>;

    await expect(createSubscription(customerId, input)).rejects.toThrow('Data de validade em formato inválido.');
  });
});

describe('createSubscription — emissão da primeira Charge', () => {
  it('assinatura ACTIVE emite a primeira Charge na criação', async () => {
    const customer = await db.customer.create({ data: { name: 'Cliente Cobrança Teste' } });
    const subscription = await createSubscription(customer.id, {
      planId: '', supplierId: '', priceCents: '10000', costCents: '3000', cycle: 'MONTHLY',
      discountType: '', discountValue: '', discountUntil: '',
      accessUsername: '', accessPassword: '', accessServer: '', screens: 1, accessNotes: '',
    } as unknown as z.infer<typeof subscriptionSchema>);

    const charge = await db.charge.findFirst({ where: { subscriptionId: subscription.id } });
    expect(charge).not.toBeNull();
    expect(charge!.status).toBe('OPEN');
    expect(charge!.principalCents.toString()).toBe('10000');
    expect(charge!.costCents.toString()).toBe('3000');
    expect(charge!.discountCents.toString()).toBe('0');
    expect(charge!.customerId).toBe(customer.id);

    await db.charge.deleteMany({ where: { subscriptionId: subscription.id } });
    await db.subscription.delete({ where: { id: subscription.id } });
    await db.customer.delete({ where: { id: customer.id } });
  });

  it('desconto PERCENT vigente na emissão reduz o principal líquido', async () => {
    const customer = await db.customer.create({ data: { name: 'Cliente Desconto Teste' } });
    const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const subscription = await createSubscription(customer.id, {
      planId: '', supplierId: '', priceCents: '10000', costCents: '3000', cycle: 'MONTHLY',
      discountType: 'PERCENT', discountValue: '10', discountUntil: farFuture,
      accessUsername: '', accessPassword: '', accessServer: '', screens: 1, accessNotes: '',
    } as unknown as z.infer<typeof subscriptionSchema>);

    const charge = await db.charge.findFirst({ where: { subscriptionId: subscription.id } });
    expect(charge!.discountCents.toString()).toBe('1000'); // 10% de 10000

    await db.charge.deleteMany({ where: { subscriptionId: subscription.id } });
    await db.subscription.delete({ where: { id: subscription.id } });
    await db.customer.delete({ where: { id: customer.id } });
  });

  it('desconto FIXED vigente na emissão converte reais para centavos corretamente', async () => {
    const customer = await db.customer.create({ data: { name: 'Cliente Desconto Fixo Teste' } });
    const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const subscription = await createSubscription(customer.id, {
      planId: '', supplierId: '', priceCents: '10000', costCents: '3000', cycle: 'MONTHLY',
      discountType: 'FIXED', discountValue: '10.50', discountUntil: farFuture,
      accessUsername: '', accessPassword: '', accessServer: '', screens: 1, accessNotes: '',
    } as unknown as z.infer<typeof subscriptionSchema>);

    const charge = await db.charge.findFirst({ where: { subscriptionId: subscription.id } });
    expect(charge!.discountCents.toString()).toBe('1050'); // R$10,50 -> 1050 centavos

    await db.charge.deleteMany({ where: { subscriptionId: subscription.id } });
    await db.subscription.delete({ where: { id: subscription.id } });
    await db.customer.delete({ where: { id: customer.id } });
  });
});

describe('changeSubscriptionPlan — troca rápida de plano na tabela de Clientes', () => {
  it('atualiza preço, custo, ciclo e fornecedor a partir do plano escolhido', async () => {
    const customer = await db.customer.create({ data: { name: 'Cliente Troca de Plano' } });
    const supplier = await db.supplier.create({ data: { name: `Fornecedor Troca ${randomUUID()}`, isActive: true } });
    const plan = await db.plan.create({
      data: { name: `Plano Troca ${randomUUID()}`, priceCents: 5000n, costCents: 2000n, cycle: 'QUARTERLY', supplierId: supplier.id },
    });
    const subscription = await db.subscription.create({
      data: { customerId: customer.id, priceCents: 1000n, costCents: 500n, cycle: 'MONTHLY', nextDueAt: new Date() },
    });

    const updated = await changeSubscriptionPlan(subscription.id, customer.id, plan.id);

    expect(updated.planId).toBe(plan.id);
    expect(updated.priceCents.toString()).toBe('5000');
    expect(updated.costCents.toString()).toBe('2000');
    expect(updated.cycle).toBe('QUARTERLY');
    expect(updated.supplierId).toBe(supplier.id);

    await db.subscription.delete({ where: { id: subscription.id } });
    await db.plan.delete({ where: { id: plan.id } });
    await db.supplier.delete({ where: { id: supplier.id } });
    await db.customer.delete({ where: { id: customer.id } });
  });

  // Bug que a troca inline tinha que evitar: `patchSubscription`/`toBaseData`
  // reescreve `screens` em toda chamada porque o form completo sempre reenvia
  // o valor atual — a troca rápida não tem esse form, então precisa preservar
  // na mão, ou telas e desconto voltariam pro default em silêncio.
  it('preserva telas e desconto — a troca rápida não passa pelo form completo', async () => {
    const customer = await db.customer.create({ data: { name: 'Cliente Troca Preserva' } });
    const plan = await db.plan.create({
      data: { name: `Plano Preserva ${randomUUID()}`, priceCents: 8000n, costCents: 3000n, cycle: 'MONTHLY' },
    });
    const subscription = await db.subscription.create({
      data: {
        customerId: customer.id,
        priceCents: 1000n,
        costCents: 500n,
        cycle: 'MONTHLY',
        nextDueAt: new Date(),
        screens: 3,
        discountType: 'PERCENT',
        discountValue: '10',
      },
    });

    const updated = await changeSubscriptionPlan(subscription.id, customer.id, plan.id);

    expect(updated.screens).toBe(3);
    expect(updated.discountType).toBe('PERCENT');
    expect(updated.discountValue?.toString()).toBe('10');

    await db.subscription.delete({ where: { id: subscription.id } });
    await db.plan.delete({ where: { id: plan.id } });
    await db.customer.delete({ where: { id: customer.id } });
  });

  it('plano sem fornecedor não zera o fornecedor atual da assinatura', async () => {
    const customer = await db.customer.create({ data: { name: 'Cliente Troca Sem Fornecedor' } });
    const supplier = await db.supplier.create({ data: { name: `Fornecedor Atual ${randomUUID()}`, isActive: true } });
    const plan = await db.plan.create({
      data: { name: `Plano Sem Fornecedor ${randomUUID()}`, priceCents: 4000n, costCents: 1500n, cycle: 'MONTHLY' },
    });
    const subscription = await db.subscription.create({
      data: { customerId: customer.id, priceCents: 1000n, costCents: 500n, cycle: 'MONTHLY', nextDueAt: new Date(), supplierId: supplier.id },
    });

    const updated = await changeSubscriptionPlan(subscription.id, customer.id, plan.id);

    expect(updated.supplierId).toBe(supplier.id);

    await db.subscription.delete({ where: { id: subscription.id } });
    await db.plan.delete({ where: { id: plan.id } });
    await db.supplier.delete({ where: { id: supplier.id } });
    await db.customer.delete({ where: { id: customer.id } });
  });

  it('assinatura de outro cliente não é alterada', async () => {
    const customer = await db.customer.create({ data: { name: 'Cliente Dono' } });
    const other = await db.customer.create({ data: { name: 'Cliente Estranho' } });
    const plan = await db.plan.create({ data: { name: `Plano Dono ${randomUUID()}`, priceCents: 4000n, costCents: 1500n } });
    const subscription = await db.subscription.create({
      data: { customerId: customer.id, priceCents: 1000n, costCents: 500n, cycle: 'MONTHLY', nextDueAt: new Date() },
    });

    await expect(changeSubscriptionPlan(subscription.id, other.id, plan.id)).rejects.toThrow(SubscriptionNotFoundError);

    await db.subscription.delete({ where: { id: subscription.id } });
    await db.plan.delete({ where: { id: plan.id } });
    await db.customer.delete({ where: { id: customer.id } });
    await db.customer.delete({ where: { id: other.id } });
  });

  it('plano inexistente recusa a troca', async () => {
    const customer = await db.customer.create({ data: { name: 'Cliente Plano Inexistente' } });
    const subscription = await db.subscription.create({
      data: { customerId: customer.id, priceCents: 1000n, costCents: 500n, cycle: 'MONTHLY', nextDueAt: new Date() },
    });

    await expect(changeSubscriptionPlan(subscription.id, customer.id, randomUUID())).rejects.toThrow(PlanNotFoundError);

    await db.subscription.delete({ where: { id: subscription.id } });
    await db.customer.delete({ where: { id: customer.id } });
  });

  it('assinatura cancelada não aceita troca de plano', async () => {
    const customer = await db.customer.create({ data: { name: 'Cliente Cancelado' } });
    const plan = await db.plan.create({ data: { name: `Plano Cancelado ${randomUUID()}`, priceCents: 4000n, costCents: 1500n } });
    const subscription = await db.subscription.create({
      data: { customerId: customer.id, priceCents: 1000n, costCents: 500n, cycle: 'MONTHLY', nextDueAt: new Date(), status: 'CANCELLED' },
    });

    await expect(changeSubscriptionPlan(subscription.id, customer.id, plan.id)).rejects.toThrow(SubscriptionCancelledError);

    await db.subscription.delete({ where: { id: subscription.id } });
    await db.plan.delete({ where: { id: plan.id } });
    await db.customer.delete({ where: { id: customer.id } });
  });
});
