import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { listCustomers } from '@/features/customers/queries';
import { backfillImportedCharges } from './customer-charge-backfill';

const SUPPLIER = 'Fornecedor Backfill Teste';
const NAMES = ['Yanka Backfill Teste', 'Cancelada Backfill Teste', 'Removida Backfill Teste'];
const TZ = 'America/Sao_Paulo';
const NOW = new Date('2026-09-08T12:00:00Z');
const DUE_PAST = new Date('2026-09-07T02:59:59.999Z'); // 06/09/2026 23:59:59.999 -03:00

async function purge() {
  await db.charge.deleteMany({ where: { customer: { name: { in: NAMES } } } });
  await db.subscription.deleteMany({ where: { customer: { name: { in: NAMES } } } });
  await db.customer.deleteMany({ where: { name: { in: NAMES } } });
  await db.supplier.deleteMany({ where: { name: SUPPLIER } });
}

beforeEach(purge);
afterEach(purge);

/** Assinatura no estado em que a importação antiga deixava: ACTIVE, zero cobrança. */
async function createImportedLikeSubscription(name: string, supplierId: string) {
  const customer = await db.customer.create({ data: { name } });
  return db.subscription.create({
    data: {
      customerId: customer.id,
      supplierId,
      priceCents: 5000n,
      costCents: 2000n,
      cycle: 'MONTHLY',
      nextDueAt: DUE_PAST,
      startedAt: new Date('2024-03-01T12:00:00Z'),
    },
  });
}

describe('backfillImportedCharges', () => {
  it('sem --apply não grava nada, só lista', async () => {
    const supplier = await db.supplier.create({ data: { name: SUPPLIER } });
    await createImportedLikeSubscription('Yanka Backfill Teste', supplier.id);

    const summary = await backfillImportedCharges({ timezone: TZ, apply: false });

    expect(summary.candidates.map((row) => row.customerName)).toContain('Yanka Backfill Teste');
    expect(summary.created).toBe(0);
    expect(await db.charge.count({ where: { customer: { name: 'Yanka Backfill Teste' } } })).toBe(0);
  });

  it('cobrança aberta pelo backfill tira o cliente de "Ativo" e o põe em "Em atraso"', async () => {
    const supplier = await db.supplier.create({ data: { name: SUPPLIER } });
    await createImportedLikeSubscription('Yanka Backfill Teste', supplier.id);

    const before = await listCustomers({ page: 1, perPage: 20, q: 'Yanka Backfill Teste', now: NOW, timezone: TZ });
    expect(before.rows[0]?.situation).toBe('ACTIVE');

    await backfillImportedCharges({ timezone: TZ, apply: true });

    const charge = await db.charge.findFirstOrThrow({ where: { customer: { name: 'Yanka Backfill Teste' } } });
    expect(charge.status).toBe('OPEN');
    expect(charge.dueAt.toISOString()).toBe(DUE_PAST.toISOString());
    // Período do ciclo que termina no vencimento — não desde `startedAt` (2024).
    expect(charge.periodStart.toISOString().slice(0, 10)).toBe('2026-08-06');
    expect(charge.periodEnd.toISOString().slice(0, 10)).toBe('2026-09-06');

    const after = await listCustomers({ page: 1, perPage: 20, q: 'Yanka Backfill Teste', now: NOW, timezone: TZ });
    expect(after.rows[0]?.situation).toBe('OVERDUE');
  });

  it('rodar duas vezes não duplica cobrança', async () => {
    const supplier = await db.supplier.create({ data: { name: SUPPLIER } });
    await createImportedLikeSubscription('Yanka Backfill Teste', supplier.id);

    await backfillImportedCharges({ timezone: TZ, apply: true });
    const second = await backfillImportedCharges({ timezone: TZ, apply: true });

    expect(second.candidates).toHaveLength(0);
    expect(await db.charge.count({ where: { customer: { name: 'Yanka Backfill Teste' } } })).toBe(1);
  });

  it('não ressuscita cobrança que o operador cancelou', async () => {
    const supplier = await db.supplier.create({ data: { name: SUPPLIER } });
    const subscription = await createImportedLikeSubscription('Cancelada Backfill Teste', supplier.id);
    await db.charge.create({
      data: {
        subscriptionId: subscription.id,
        customerId: subscription.customerId,
        supplierId: supplier.id,
        principalCents: 5000n,
        costCents: 2000n,
        periodStart: new Date('2026-08-06T00:00:00Z'),
        periodEnd: new Date('2026-09-06T00:00:00Z'),
        dueAt: DUE_PAST,
        status: 'CANCELLED',
        cancelledAt: NOW,
        cancelReason: 'teste',
      },
    });

    const summary = await backfillImportedCharges({ timezone: TZ, apply: true });

    expect(summary.candidates.map((row) => row.customerName)).not.toContain('Cancelada Backfill Teste');
    expect(await db.charge.count({ where: { customer: { name: 'Cancelada Backfill Teste' } } })).toBe(1);
  });

  it('ignora cliente removido — ele já saiu do fluxo de cobrança', async () => {
    const supplier = await db.supplier.create({ data: { name: SUPPLIER } });
    const subscription = await createImportedLikeSubscription('Removida Backfill Teste', supplier.id);
    await db.customer.update({ where: { id: subscription.customerId }, data: { deletedAt: NOW } });

    const summary = await backfillImportedCharges({ timezone: TZ, apply: true });

    expect(summary.candidates.map((row) => row.customerName)).not.toContain('Removida Backfill Teste');
    expect(await db.charge.count({ where: { customer: { name: 'Removida Backfill Teste' } } })).toBe(0);
  });
});
