import { afterEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { listCustomers } from './queries';

afterEach(async () => {
  await db.customer.deleteMany({ where: { name: 'Sem Telefone Teste' } });
});

describe('listCustomers', () => {
  it('busca por nome não quebra quando algum cliente não tem telefone', async () => {
    await db.customer.create({ data: { name: 'Sem Telefone Teste', phone: null } });

    const { rows } = await listCustomers({ page: 1, perPage: 8, q: 'Sem Telefone Teste' });

    expect(rows).toHaveLength(1);
    expect(rows[0].phone).toBeNull();
  });
});
