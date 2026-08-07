import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { encrypt } from '@/lib/crypto';
import { createSubscription, revealCredential } from './service';
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
