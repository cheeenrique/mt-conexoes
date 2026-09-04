import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { CustomerNotFoundError, findCustomerIdByPhone, insertCustomer, resolveImportedCustomer, softDeleteCustomer } from './service';

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

// `Customer.phone` não é mais `@@unique` (migration 00000000000020) — duas
// pessoas cobradas separadamente podem dividir um WhatsApp. Os três testes
// abaixo não tinham cobertura nenhuma antes desta mudança.
describe('insertCustomer — telefone repetido', () => {
  it('dois cadastros com o mesmo telefone não recusam mais', async () => {
    const phone = '+5511988880010';
    const a = await db.$transaction((tx) =>
      insertCustomer(tx, { name: `${NAME_PREFIX} A`, phone, email: '', document: '', notes: '' }),
    );
    const b = await db.$transaction((tx) =>
      insertCustomer(tx, { name: `${NAME_PREFIX} B`, phone, email: '', document: '', notes: '' }),
    );

    expect(a.id).not.toBe(b.id);
    expect(await db.customer.count({ where: { phone } })).toBe(2);
  });
});

describe('findCustomerIdByPhone', () => {
  it('sem cliente com esse telefone, devolve null', async () => {
    expect(await findCustomerIdByPhone('+5511988880099')).toBeNull();
  });

  it('com dois clientes no mesmo telefone, devolve o mais antigo — determinístico', async () => {
    const phone = '+5511988880011';
    const older = await db.customer.create({ data: { name: `${NAME_PREFIX} Antigo`, phone } });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await db.customer.create({ data: { name: `${NAME_PREFIX} Novo`, phone } });

    const found = await findCustomerIdByPhone(phone);
    expect(found?.id).toBe(older.id);
  });
});

describe('resolveImportedCustomer', () => {
  it('sem telefone, cria um Customer novo a cada chamada', async () => {
    const a = await db.$transaction((tx) => resolveImportedCustomer(tx, { name: `${NAME_PREFIX} Sem Tel A`, phone: null }));
    const b = await db.$transaction((tx) => resolveImportedCustomer(tx, { name: `${NAME_PREFIX} Sem Tel B`, phone: null }));
    expect(a.id).not.toBe(b.id);
  });

  it('com telefone, a segunda linha da planilha consolida no Customer que a primeira criou', async () => {
    const phone = '+5511988880012';
    const first = await db.$transaction((tx) => resolveImportedCustomer(tx, { name: `${NAME_PREFIX} Consolida`, phone }));
    const second = await db.$transaction((tx) => resolveImportedCustomer(tx, { name: `${NAME_PREFIX} Consolida`, phone }));

    expect(second.id).toBe(first.id);
    expect(await db.customer.count({ where: { phone } })).toBe(1);
  });

  it('telefone já dividido por dois cadastros manuais consolida no mais antigo, sem criar um terceiro', async () => {
    const phone = '+5511988880013';
    const older = await db.customer.create({ data: { name: `${NAME_PREFIX} Manual Antigo`, phone } });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await db.customer.create({ data: { name: `${NAME_PREFIX} Manual Novo`, phone } });

    const resolved = await db.$transaction((tx) => resolveImportedCustomer(tx, { name: `${NAME_PREFIX} Da Planilha`, phone }));

    expect(resolved.id).toBe(older.id);
    expect(await db.customer.count({ where: { phone } })).toBe(2); // não criou um terceiro
  });
});
