import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { listCustomers } from './queries';

const TZ = 'America/Sao_Paulo';
const NOW = new Date('2026-08-22T15:00:00Z'); // 12:00 de 22/08 em São Paulo
const TAG = 'ZzFixtureSituacao';

/** 23:59:59.999 local do dia — o formato em que o sistema grava `dueAt`. */
function dueAt(day: string): Date {
  return new Date(`${day}T23:59:59.999-03:00`);
}

/**
 * Purga por chave natural, no `beforeAll` **e** no `afterAll`: o Postgres de
 * integração é compartilhado e um crash no meio do seed deixaria o telefone da
 * fixture ocupado, quebrando toda execução seguinte por unique de `phone`.
 */
async function purge() {
  const customers = await db.customer.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } });
  const ids = customers.map((c) => c.id);
  if (ids.length === 0) return;
  await db.payment.deleteMany({ where: { charge: { customerId: { in: ids } } } });
  await db.charge.deleteMany({ where: { customerId: { in: ids } } });
  await db.subscription.deleteMany({ where: { customerId: { in: ids } } });
  await db.customer.deleteMany({ where: { id: { in: ids } } });
}

async function seedCustomer(params: {
  suffix: string;
  phone: string | null;
  subscriptionStatus?: 'ACTIVE' | 'SUSPENDED' | 'CANCELLED';
  accessUsername?: string;
  chargeDueDay?: string;
  chargeStatus?: 'OPEN' | 'OVERDUE' | 'PAID';
}): Promise<string> {
  const customer = await db.customer.create({ data: { name: `${TAG} ${params.suffix}`, phone: params.phone } });
  if (!params.subscriptionStatus) return customer.id;

  const subscription = await db.subscription.create({
    data: {
      customerId: customer.id,
      priceCents: 12000n,
      costCents: 4000n,
      nextDueAt: dueAt('2026-09-05'),
      status: params.subscriptionStatus,
      accessUsername: params.accessUsername,
    },
  });

  if (params.chargeDueDay) {
    await db.charge.create({
      data: {
        subscriptionId: subscription.id,
        customerId: customer.id,
        principalCents: 12000n,
        periodStart: new Date(`${params.chargeDueDay}T00:00:00Z`),
        periodEnd: new Date(`${params.chargeDueDay}T00:00:00Z`),
        dueAt: dueAt(params.chargeDueDay),
        status: params.chargeStatus ?? 'OPEN',
      },
    });
  }
  return customer.id;
}

beforeAll(async () => {
  await purge();
  await seedCustomer({ suffix: 'Ativo', phone: '+5562990000001', subscriptionStatus: 'ACTIVE' });
  await seedCustomer({
    suffix: 'VenceHoje',
    phone: '+5562990000002',
    subscriptionStatus: 'ACTIVE',
    chargeDueDay: '2026-08-22',
  });
  await seedCustomer({
    suffix: 'Atraso',
    phone: '+5562990000003',
    subscriptionStatus: 'ACTIVE',
    chargeDueDay: '2026-08-19',
  });
  await seedCustomer({
    suffix: 'AtrasoEHoje',
    phone: '+5562990000004',
    subscriptionStatus: 'ACTIVE',
    chargeDueDay: '2026-08-18',
  });
  await seedCustomer({
    suffix: 'EmAberto',
    phone: '+5562990000005',
    subscriptionStatus: 'ACTIVE',
    chargeDueDay: '2026-08-30',
  });
  await seedCustomer({
    suffix: 'Suspenso',
    phone: '+5562990000006',
    subscriptionStatus: 'SUSPENDED',
    chargeDueDay: '2026-08-10',
  });
  await seedCustomer({ suffix: 'SemAssinatura', phone: '+5562990000007' });
  await seedCustomer({
    suffix: 'ComLogin',
    phone: '+5562990000008',
    subscriptionStatus: 'ACTIVE',
    accessUsername: 'zzfixture.login',
  });

  // "AtrasoEHoje" tem duas assinaturas: uma vencida em 18/08 e outra vencendo
  // hoje. Uma cobrança em aberto por assinatura é o teto do índice parcial do
  // banco, então este caso só existe com o cliente pagando dois pacotes.
  const both = await db.customer.findFirstOrThrow({ where: { name: `${TAG} AtrasoEHoje` } });
  const second = await db.subscription.create({
    data: {
      customerId: both.id,
      priceCents: 4500n,
      costCents: 1600n,
      nextDueAt: dueAt('2026-09-22'),
      status: 'ACTIVE',
    },
  });
  await db.charge.create({
    data: {
      subscriptionId: second.id,
      customerId: both.id,
      principalCents: 4500n,
      periodStart: new Date('2026-08-22T00:00:00Z'),
      periodEnd: new Date('2026-08-22T00:00:00Z'),
      dueAt: dueAt('2026-08-22'),
      status: 'OPEN',
    },
  });
});

afterAll(purge);

/** Busca pelo prefixo da fixture isola o recorte — nada de total absoluto global. */
function listFixture(params: { q?: string; situation?: 'ACTIVE' | 'DUE_TODAY' | 'OVERDUE' } = {}) {
  return listCustomers({ page: 1, perPage: 20, q: params.q ?? TAG, situation: params.situation, now: NOW, timezone: TZ });
}

describe('listCustomers — situação derivada', () => {
  it('deriva as cinco situações do handoff mais o cliente sem assinatura', async () => {
    const { rows } = await listFixture();
    const bySuffix = Object.fromEntries(rows.map((row) => [row.name.replace(`${TAG} `, ''), row.situation]));

    expect(bySuffix).toMatchObject({
      Ativo: 'ACTIVE',
      VenceHoje: 'DUE_TODAY',
      Atraso: 'OVERDUE',
      EmAberto: 'OPEN',
      Suspenso: 'SUSPENDED',
      SemAssinatura: 'NO_SUBSCRIPTION',
    });
  });

  it('quem deve de ontem e de hoje está em atraso, não vencendo hoje', async () => {
    const { rows } = await listFixture({ q: `${TAG} AtrasoEHoje` });
    expect(rows[0].situation).toBe('OVERDUE');
  });
});

describe('listCustomers — chips de situação', () => {
  it('o chip "Ativo" traz só quem não tem cobrança em aberto', async () => {
    const { rows, total } = await listFixture({ situation: 'ACTIVE' });
    expect(rows.map((r) => r.name).sort()).toEqual([`${TAG} Ativo`, `${TAG} ComLogin`]);
    expect(total).toBe(2);
  });

  it('o chip "Vence hoje" não traz quem já está em atraso', async () => {
    const { rows } = await listFixture({ situation: 'DUE_TODAY' });
    expect(rows.map((r) => r.name)).toEqual([`${TAG} VenceHoje`]);
  });

  it('o chip "Em atraso" traz quem tem cobrança vencida, inclusive com outra vencendo hoje', async () => {
    const { rows } = await listFixture({ situation: 'OVERDUE' });
    expect(rows.map((r) => r.name).sort()).toEqual([`${TAG} Atraso`, `${TAG} AtrasoEHoje`]);
  });

  it('nenhum chip traz o suspenso — mas ele continua na lista sem filtro', async () => {
    const filtered = await Promise.all(
      (['ACTIVE', 'DUE_TODAY', 'OVERDUE'] as const).map((situation) => listFixture({ situation })),
    );
    const names = filtered.flatMap((result) => result.rows.map((row) => row.name));
    expect(names).not.toContain(`${TAG} Suspenso`);

    const { rows } = await listFixture();
    expect(rows.map((r) => r.name)).toContain(`${TAG} Suspenso`);
  });

  // O predicado do chip e `resolveCustomerSituation` são dois códigos diferentes
  // sobre o mesmo conceito. Este teste é o que impede um divergir do outro.
  it('toda linha que o chip devolve carrega a situação daquele chip', async () => {
    for (const situation of ['ACTIVE', 'DUE_TODAY', 'OVERDUE'] as const) {
      const { rows } = await listFixture({ situation });
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((row) => row.situation === situation)).toBe(true);
    }
  });
});

describe('listCustomers — busca', () => {
  it('acha por telefone formatado do jeito que o operador digita', async () => {
    const { rows } = await listCustomers({
      page: 1,
      perPage: 20,
      q: '(62) 99000-0003',
      now: NOW,
      timezone: TZ,
    });
    expect(rows.map((r) => r.name)).toContain(`${TAG} Atraso`);
  });

  it('acha por pedaço do telefone sem formatar', async () => {
    const { rows } = await listCustomers({ page: 1, perPage: 20, q: '6299000000', now: NOW, timezone: TZ });
    expect(rows.length).toBeGreaterThanOrEqual(8);
  });

  it('acha pelo usuário de acesso da assinatura', async () => {
    const { rows } = await listCustomers({ page: 1, perPage: 20, q: 'zzfixture.login', now: NOW, timezone: TZ });
    expect(rows.map((r) => r.name)).toEqual([`${TAG} ComLogin`]);
  });

  it('busca por nome não quebra quando algum cliente não tem telefone', async () => {
    const { rows } = await listFixture({ q: `${TAG} SemAssinatura` });
    expect(rows).toHaveLength(1);
    expect(rows[0].phone).toBe('+5562990000007');
  });
});

describe('listCustomers — filtro por plano e fornecedor', () => {
  it('planId e supplierId recortam só quem tem aquele plano ou fornecedor na assinatura', async () => {
    const supplier = await db.supplier.create({ data: { name: `${TAG} Fornecedor`, isActive: true } });
    const plan = await db.plan.create({ data: { name: `${TAG} Plano`, priceCents: 5000n, costCents: 2000n, supplierId: supplier.id } });
    const comPlano = await db.customer.create({ data: { name: `${TAG} ComPlano`, phone: '+5562990000009' } });
    const semPlano = await db.customer.create({ data: { name: `${TAG} SemPlano`, phone: '+5562990000010' } });
    await db.subscription.create({
      data: { customerId: comPlano.id, priceCents: 5000n, costCents: 2000n, nextDueAt: new Date(), planId: plan.id, supplierId: supplier.id },
    });
    await db.subscription.create({
      data: { customerId: semPlano.id, priceCents: 3000n, costCents: 1000n, nextDueAt: new Date() },
    });

    const byPlan = await listCustomers({ page: 1, perPage: 20, planId: plan.id, now: NOW, timezone: TZ });
    expect(byPlan.rows.map((r) => r.name)).toEqual([`${TAG} ComPlano`]);

    const bySupplier = await listCustomers({ page: 1, perPage: 20, supplierId: supplier.id, now: NOW, timezone: TZ });
    expect(bySupplier.rows.map((r) => r.name)).toEqual([`${TAG} ComPlano`]);

    await db.subscription.deleteMany({ where: { customerId: { in: [comPlano.id, semPlano.id] } } });
    await db.customer.deleteMany({ where: { id: { in: [comPlano.id, semPlano.id] } } });
    await db.plan.delete({ where: { id: plan.id } });
    await db.supplier.delete({ where: { id: supplier.id } });
  });
});
