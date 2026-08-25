import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { decrypt } from '@/lib/crypto';
import { buildFixtureWorkbook } from '@/features/customers/import/__fixtures__/generate-fixture';
import { readWorkbookRows } from '@/features/customers/import/workbook';
import { ImportSupplierNotFoundError } from '@/features/customers/import/errors';
import { importCustomersFromRows, importCustomersFromUpload } from './customer-import';

const SUPPLIER_A = 'Fornecedor Import Teste A';
const SUPPLIER_B = 'Fornecedor Import Teste B';
const CUSTOMER_NAMES = ['Maria Import Teste', 'Cliente Sem Telefone Teste', 'Sem Nome Import Teste'];
const PHONE = '+5511988880001';
const TZ = 'America/Sao_Paulo';
const NOW = new Date('2026-08-20T12:00:00Z');

async function purge() {
  await db.subscription.deleteMany({ where: { supplier: { name: { in: [SUPPLIER_A, SUPPLIER_B] } } } });
  await db.customer.deleteMany({ where: { OR: [{ name: { in: CUSTOMER_NAMES } }, { phone: PHONE }] } });
  await db.supplier.deleteMany({ where: { name: { in: [SUPPLIER_A, SUPPLIER_B] } } });
}

beforeEach(purge);
afterEach(purge);

async function createSupplier(name: string) {
  return db.supplier.create({ data: { name } });
}

describe('importCustomersFromRows', () => {
  it('linha sem telefone entra — ausência não é motivo de recusa', async () => {
    const supplier = await createSupplier(SUPPLIER_A);

    const summary = await importCustomersFromRows({
      rows: [{ CODIGO: 'Cliente Sem Telefone Teste', USUARIO: 'sem.tel.teste', VALIDADE: '10/08/2026', VALOR: '30,00' }],
      supplierId: supplier.id,
      timezone: TZ,
      now: NOW,
    });

    expect(summary).toMatchObject({ totalRows: 1, imported: [{ status: 'imported' }], skipped: [], rejected: [] });
    const customer = await db.customer.findFirstOrThrow({ where: { name: 'Cliente Sem Telefone Teste' } });
    expect(customer.phone).toBeNull();
  });

  it('serial do Excel vira a data certa (23:59:59 local, não meia-noite UTC)', async () => {
    const supplier = await createSupplier(SUPPLIER_A);
    const rows = readWorkbookRows(
      buildFixtureWorkbook([{ CODIGO: 'Maria Import Teste', VALIDADE: new Date('2026-08-10'), VALOR: '50,00' }]),
    );

    await importCustomersFromRows({ rows, supplierId: supplier.id, timezone: TZ, now: NOW });

    const subscription = await db.subscription.findFirstOrThrow({
      where: { customer: { name: 'Maria Import Teste' } },
    });
    // 23:59:59.999 de 10/08/2026 em America/Sao_Paulo (UTC-3) cai em 11/08 em UTC.
    expect(subscription.nextDueAt.toISOString()).toBe('2026-08-11T02:59:59.999Z');
  });

  it('valor numérico puro (célula sem formatação) vira centavos certos', async () => {
    const supplier = await createSupplier(SUPPLIER_A);

    await importCustomersFromRows({
      rows: [{ CODIGO: 'Maria Import Teste', VALIDADE: '10/08/2026', VALOR: 105, CUSTO: 30 }],
      supplierId: supplier.id,
      timezone: TZ,
      now: NOW,
    });

    const subscription = await db.subscription.findFirstOrThrow({
      where: { customer: { name: 'Maria Import Teste' } },
    });
    expect(subscription.priceCents.toString()).toBe('10500');
    expect(subscription.costCents.toString()).toBe('3000');
  });

  it('SENHA numérica é criptografada e revela de volta o mesmo texto', async () => {
    const supplier = await createSupplier(SUPPLIER_A);

    await importCustomersFromRows({
      rows: [{ CODIGO: 'Maria Import Teste', USUARIO: 'maria.senha.teste', VALIDADE: '10/08/2026', VALOR: '50,00', SENHA: 9939894 }],
      supplierId: supplier.id,
      timezone: TZ,
      now: NOW,
    });

    const subscription = await db.subscription.findFirstOrThrow({ where: { accessUsername: 'maria.senha.teste' } });
    expect(subscription.accessPasswordEnc).toBeTruthy();
    expect(decrypt(subscription.accessPasswordEnc!, 'subscription.accessPassword')).toBe('9939894');
  });

  it('rodar o mesmo arquivo duas vezes não duplica (idempotência por accessUsername + fornecedor)', async () => {
    const supplier = await createSupplier(SUPPLIER_A);
    const rows = [{ CODIGO: 'Maria Import Teste', USUARIO: 'maria.dup.teste', VALIDADE: '10/08/2026', VALOR: '50,00' }];

    const first = await importCustomersFromRows({ rows, supplierId: supplier.id, timezone: TZ, now: NOW });
    expect(first.imported).toHaveLength(1);

    const second = await importCustomersFromRows({ rows, supplierId: supplier.id, timezone: TZ, now: NOW });
    expect(second.skipped).toHaveLength(1);
    expect(second.imported).toHaveLength(0);

    const count = await db.subscription.count({ where: { accessUsername: 'maria.dup.teste' } });
    expect(count).toBe(1);
  });

  it('mesmo telefone em dois fornecedores consolida num Customer só, com duas assinaturas', async () => {
    const supplierA = await createSupplier(SUPPLIER_A);
    const supplierB = await createSupplier(SUPPLIER_B);
    const row = { CODIGO: 'Maria Import Teste', WHATSAPP: '(11) 98888-0001', VALIDADE: '10/08/2026', VALOR: '50,00' };

    await importCustomersFromRows({ rows: [row], supplierId: supplierA.id, timezone: TZ, now: NOW });
    await importCustomersFromRows({ rows: [row], supplierId: supplierB.id, timezone: TZ, now: NOW });

    const customer = await db.customer.findUniqueOrThrow({ where: { phone: PHONE } });
    expect(await db.subscription.count({ where: { customerId: customer.id } })).toBe(2);
  });

  it('recusa linha com nome ausente, vencimento inválido ou valor negativo, com o motivo', async () => {
    const supplier = await createSupplier(SUPPLIER_A);

    const summary = await importCustomersFromRows({
      rows: [
        { CODIGO: '', VALIDADE: '10/08/2026', VALOR: '50,00' },
        { CODIGO: 'Sem Nome Import Teste', VALOR: '50,00' },
        { CODIGO: 'Sem Nome Import Teste', VALIDADE: '10/08/2026', VALOR: -10 },
      ],
      supplierId: supplier.id,
      timezone: TZ,
      now: NOW,
    });

    expect(summary.rejected).toHaveLength(3);
    expect(summary.rejected.map((r) => r.reason)).toEqual([
      'Nome ausente.',
      'Data de vencimento ausente ou inválida.',
      'Valor do serviço ausente, inválido ou negativo.',
    ]);
  });

  it('erro de domínio quando o fornecedor não existe', async () => {
    await expect(
      importCustomersFromRows({
        rows: [{ CODIGO: 'Maria Import Teste', VALIDADE: '10/08/2026', VALOR: '50,00' }],
        supplierId: '019199aa-0000-7000-8000-000000000000',
        timezone: TZ,
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(ImportSupplierNotFoundError);
  });
});

describe('importCustomersFromUpload', () => {
  it('lê o File enviado pela tela e importa igual ao caminho de linhas', async () => {
    const supplier = await createSupplier(SUPPLIER_A);
    const buffer = buildFixtureWorkbook([{ CODIGO: 'Maria Import Teste', VALIDADE: new Date('2026-08-10'), VALOR: '50,00' }]);
    const file = new File([new Uint8Array(buffer)], 'planilha.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const summary = await importCustomersFromUpload({ supplierId: supplier.id, file });

    expect(summary.imported).toHaveLength(1);
    expect(await db.customer.count({ where: { name: 'Maria Import Teste' } })).toBe(1);
  });
});
