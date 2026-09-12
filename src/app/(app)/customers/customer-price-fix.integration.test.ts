import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { fixSuspiciousPrices } from './customer-price-fix';

const TAG = 'ZzFixPreco';
const due = (day: string) => new Date(`${day}T23:59:59.999-03:00`);

async function purge() {
  const ids = (await db.customer.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } })).map((c) => c.id);
  if (ids.length === 0) return;
  await db.payment.deleteMany({ where: { charge: { customerId: { in: ids } } } });
  await db.charge.deleteMany({ where: { customerId: { in: ids } } });
  await db.subscription.deleteMany({ where: { customerId: { in: ids } } });
  await db.customer.deleteMany({ where: { id: { in: ids } } });
}
afterEach(purge);

/** Assinatura com preço inflado e o histórico que denuncia o valor certo. */
async function seed(params: {
  suffix: string;
  priceCents: bigint;
  paidCents?: bigint[];
  chargeDueDay?: string;
  chargePaidCents?: bigint;
}) {
  const customer = await db.customer.create({ data: { name: `${TAG} ${params.suffix}` } });
  const subscription = await db.subscription.create({
    data: { customerId: customer.id, priceCents: params.priceCents, costCents: 1000n, cycle: 'MONTHLY', nextDueAt: due('2026-09-10') },
  });

  // Ciclos antigos, já quitados: é deles que sai a mediana.
  for (const [index, amount] of (params.paidCents ?? []).entries()) {
    const old = await db.charge.create({
      data: {
        subscriptionId: subscription.id, customerId: customer.id,
        principalCents: amount, discountCents: 0n, costCents: 1000n,
        periodStart: new Date(`2026-0${index + 3}-10T00:00:00Z`),
        periodEnd: new Date(`2026-0${index + 4}-10T00:00:00Z`),
        dueAt: due(`2026-0${index + 4}-10`), status: 'PAID', paidAt: new Date(`2026-0${index + 4}-05T12:00:00Z`),
      },
    });
    await db.payment.create({
      data: { chargeId: old.id, amountCents: amount, method: 'PIX', paidAt: new Date(`2026-0${index + 4}-05T12:00:00Z`), idempotencyKey: randomUUID() },
    });
  }

  if (params.chargeDueDay) {
    const open = await db.charge.create({
      data: {
        subscriptionId: subscription.id, customerId: customer.id,
        principalCents: params.priceCents, discountCents: 0n, costCents: 1000n,
        periodStart: new Date('2026-08-10T00:00:00Z'), periodEnd: new Date('2026-09-10T00:00:00Z'),
        dueAt: due(params.chargeDueDay), status: 'OVERDUE',
      },
    });
    if (params.chargePaidCents) {
      await db.payment.create({
        data: { chargeId: open.id, amountCents: params.chargePaidCents, method: 'PIX', paidAt: new Date('2026-09-05T12:00:00Z'), idempotencyKey: randomUUID() },
      });
    }
  }
  return { customerId: customer.id, subscriptionId: subscription.id };
}

function rowOf(summary: Awaited<ReturnType<typeof fixSuspiciousPrices>>, suffix: string) {
  return summary.rows.find((r) => r.customerName === `${TAG} ${suffix}`);
}

/**
 * Relatado em 11/09/2026: clientes de R$ 30,00/mês cadastrados em R$ 1.830,00 e
 * R$ 750,00. O preço certo está no histórico — quem pagou R$ 30 nas últimas
 * vezes tem assinatura de R$ 30.
 */
describe('fixSuspiciousPrices', () => {
  it('sem --apply não grava nada, e promete o desfecho que o apply entrega', async () => {
    const { subscriptionId } = await seed({ suffix: 'Walderi', priceCents: 183000n, paidCents: [3000n, 3000n], chargeDueDay: '2026-09-10', chargePaidCents: 3000n });

    const preview = await fixSuspiciousPrices({ apply: false });

    expect(rowOf(preview, 'Walderi')).toMatchObject({ fromCents: 183000n, toCents: 3000n, outcome: 'cobranca_fechada' });
    expect(preview.applied).toBe(0);
    const subscription = await db.subscription.findUniqueOrThrow({ where: { id: subscriptionId } });
    expect(subscription.priceCents.toString()).toBe('183000');
  });

  it('corrige o preço pela mediana do que o cliente pagou', async () => {
    const { subscriptionId } = await seed({ suffix: 'Walderi', priceCents: 183000n, paidCents: [3000n, 3000n] });

    await fixSuspiciousPrices({ apply: true });

    const subscription = await db.subscription.findUniqueOrThrow({ where: { id: subscriptionId } });
    expect(subscription.priceCents.toString()).toBe('3000');
  });

  it('cobrança em aberto sem pagamento passa a valer o preço novo', async () => {
    const { subscriptionId } = await seed({ suffix: 'Tadeu', priceCents: 75000n, paidCents: [3000n], chargeDueDay: '2026-09-10' });

    const summary = await fixSuspiciousPrices({ apply: true });

    expect(rowOf(summary, 'Tadeu')?.outcome).toBe('cobranca_realinhada');
    const open = await db.charge.findFirstOrThrow({ where: { subscriptionId, status: { notIn: ['PAID', 'CANCELLED'] } } });
    expect(open.principalCents.toString()).toBe('3000');
  });

  it('cobrança com pagamento parcial fecha pelo valor pago e abre o ciclo seguinte no preço certo', async () => {
    const { subscriptionId } = await seed({ suffix: 'Walderi', priceCents: 183000n, paidCents: [3000n, 3000n], chargeDueDay: '2026-09-10', chargePaidCents: 3000n });

    const summary = await fixSuspiciousPrices({ apply: true });

    expect(rowOf(summary, 'Walderi')?.outcome).toBe('cobranca_fechada');
    const paid = await db.charge.findFirstOrThrow({ where: { subscriptionId, dueAt: due('2026-09-10') } });
    expect(paid.status).toBe('PAID');
    expect((paid.principalCents - paid.discountCents).toString()).toBe('3000');

    const next = await db.charge.findFirstOrThrow({ where: { subscriptionId, dueAt: { gt: due('2026-09-10') } } });
    expect(next.principalCents.toString()).toBe('3000');
  });

  it('quem nunca pagou fica de fora — sem histórico não há preço certo para chutar', async () => {
    const { subscriptionId } = await seed({ suffix: 'SemHistorico', priceCents: 183000n, chargeDueDay: '2026-09-10' });

    const summary = await fixSuspiciousPrices({ apply: true });

    expect(rowOf(summary, 'SemHistorico')?.outcome).toBe('sem_historico');
    const subscription = await db.subscription.findUniqueOrThrow({ where: { id: subscriptionId } });
    expect(subscription.priceCents.toString()).toBe('183000');
  });

  /** Sem esta trava, um pagamento simbólico de R$ 0,01 reescreveria a assinatura
   *  para R$ 0,01 — o lote causaria mais dano do que conserta. */
  it('pagamento que não cobre o custo não vira preço', async () => {
    const { subscriptionId } = await seed({ suffix: 'Simbolico', priceCents: 183000n, paidCents: [1n, 1n], chargeDueDay: '2026-09-10' });

    const summary = await fixSuspiciousPrices({ apply: true });

    expect(rowOf(summary, 'Simbolico')?.outcome).toBe('pagamento_implausivel');
    const subscription = await db.subscription.findUniqueOrThrow({ where: { id: subscriptionId } });
    expect(subscription.priceCents.toString()).toBe('183000');
  });

  it('quem paga o que está cadastrado não é tocado', async () => {
    const { subscriptionId } = await seed({ suffix: 'Certo', priceCents: 3000n, paidCents: [3000n, 3000n], chargeDueDay: '2026-09-10' });

    const summary = await fixSuspiciousPrices({ apply: true });

    expect(rowOf(summary, 'Certo')).toBeUndefined();
    const subscription = await db.subscription.findUniqueOrThrow({ where: { id: subscriptionId } });
    expect(subscription.priceCents.toString()).toBe('3000');
  });

  it('idempotente: a segunda passada não acha mais nada para corrigir', async () => {
    await seed({ suffix: 'Walderi', priceCents: 183000n, paidCents: [3000n, 3000n], chargeDueDay: '2026-09-10', chargePaidCents: 3000n });

    await fixSuspiciousPrices({ apply: true });
    const segunda = await fixSuspiciousPrices({ apply: true });

    expect(rowOf(segunda, 'Walderi')).toBeUndefined();
  });
});
