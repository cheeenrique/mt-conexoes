import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { writeFileSync, unlinkSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { db } from '@/lib/db';
import { buildFixtureWorkbook } from './import/__fixtures__/generate-fixture';

const SUPPLIER_NAME = 'Fornecedor Teste Importação';
const FIXTURE_PATH = '/tmp/import-fixture-test.xlsx';

const ROWS = [
  {
    CODIGO: 'Maria Teste Import',
    WHATSAPP: '(11) 98888-7777',
    USUARIO: 'maria.import',
    SENHA: 123456, // planilha real guarda senha como número
    'CRIAÇÃO': new Date('2024-01-01'),
    VALIDADE: new Date('2026-08-10'),
    TELAS: 2,
    CUSTO: '20,00',
    VALOR: '50,00',
  },
  {
    // sem WhatsApp — não é mais motivo de recusa, cria Customer sem telefone
    CODIGO: 'Cliente Sem Telefone',
    USUARIO: 'sem.telefone',
    SENHA: 654321,
    VALIDADE: new Date('2026-08-15'),
    VALOR: '30,00',
  },
  {
    // sem nome — recusada
    CODIGO: '',
    VALIDADE: new Date('2026-08-10'),
    VALOR: '50,00',
  },
];

async function cleanup() {
  await db.subscription.deleteMany({ where: { supplier: { name: SUPPLIER_NAME } } });
  await db.customer.deleteMany({ where: { phone: '+5511988887777' } });
  await db.customer.deleteMany({ where: { name: 'Cliente Sem Telefone' } });
  await db.supplier.deleteMany({ where: { name: SUPPLIER_NAME } });
  for (const file of readdirSync('.')) {
    if (file.startsWith('import-report-')) unlinkSync(file);
  }
}

beforeEach(cleanup);
afterEach(async () => {
  await cleanup();
  try { unlinkSync(FIXTURE_PATH); } catch { /* já removido */ }
});

describe('import-customers script', () => {
  it('importa com e sem telefone, recusa linha inválida, é idempotente', async () => {
    writeFileSync(FIXTURE_PATH, buildFixtureWorkbook(ROWS));

    const run = () => execSync(`pnpm tsx scripts/import-customers.ts ${FIXTURE_PATH} "${SUPPLIER_NAME}"`, { encoding: 'utf8' });

    const firstOutput = run();
    expect(firstOutput).toContain('Importadas: 2');
    expect(firstOutput).toContain('Recusadas: 1');

    const withPhone = await db.customer.findUnique({ where: { phone: '+5511988887777' } });
    expect(withPhone?.name).toBe('Maria Teste Import');

    const withoutPhone = await db.customer.findFirst({ where: { name: 'Cliente Sem Telefone' } });
    expect(withoutPhone?.phone).toBeNull();

    const subscription = await db.subscription.findFirst({ where: { customerId: withPhone!.id } });
    expect(subscription?.priceCents.toString()).toBe('5000');
    expect(subscription?.costCents.toString()).toBe('2000');
    expect(subscription?.nextDueAt.toISOString().slice(0, 10)).toBe('2026-08-10');
    expect(subscription?.accessUsername).toBe('maria.import');

    // Segunda rodada — mesmo arquivo, não duplica (checado por accessUsername+fornecedor)
    const secondOutput = run();
    expect(secondOutput).toContain('Puladas (já existiam): 2');

    const count = await db.subscription.count({ where: { customerId: withPhone!.id } });
    expect(count).toBe(1);
  }, 30_000);
});
