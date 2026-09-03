import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { CustomerNotFoundError, softDeleteCustomer } from './service';

const NAME_PREFIX = 'Soft Delete Teste';

async function purge() {
  await db.customer.deleteMany({ where: { name: { startsWith: NAME_PREFIX } } });
}
afterEach(purge);

describe('softDeleteCustomer', () => {
  it('grava deletedAt, dado continua intacto', async () => {
    const customer = await db.customer.create({
      data: { name: `${NAME_PREFIX} 1`, phone: '+5511988880001', email: 'titular@exemplo.com' },
    });

    await softDeleteCustomer(customer.id, new Date('2026-08-01T12:00:00Z'));

    const reloaded = await db.customer.findUniqueOrThrow({ where: { id: customer.id } });
    expect(reloaded.deletedAt).toEqual(new Date('2026-08-01T12:00:00Z'));
    // soft delete, não anonimização — nada some.
    expect(reloaded.name).toBe(`${NAME_PREFIX} 1`);
    expect(reloaded.phone).toBe('+5511988880001');
    expect(reloaded.email).toBe('titular@exemplo.com');
  });

  it('idempotente — chamar de novo não regrava o carimbo', async () => {
    const customer = await db.customer.create({ data: { name: `${NAME_PREFIX} 2` } });

    await softDeleteCustomer(customer.id, new Date('2026-08-01T12:00:00Z'));
    await softDeleteCustomer(customer.id, new Date('2026-08-02T12:00:00Z'));

    const reloaded = await db.customer.findUniqueOrThrow({ where: { id: customer.id } });
    expect(reloaded.deletedAt).toEqual(new Date('2026-08-01T12:00:00Z'));
  });

  it('cliente inexistente recusa com CustomerNotFoundError', async () => {
    await expect(softDeleteCustomer(randomUUID(), new Date())).rejects.toThrow(CustomerNotFoundError);
  });
});
