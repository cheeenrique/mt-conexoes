import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { writeFileSync, unlinkSync, readdirSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { db } from '@/lib/db';
import { decrypt } from '@/lib/crypto';
import { buildFixtureWorkbook } from '@/features/customers/import/__fixtures__/generate-fixture';

const REPORT_DIR = './tmp';

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
  if (existsSync(REPORT_DIR)) {
    for (const file of readdirSync(REPORT_DIR)) {
      if (file.startsWith('import-report-')) unlinkSync(`${REPORT_DIR}/${file}`);
    }
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

    // Invoca o script pelo npm script real (`pnpm import:customers`), não
    // diretamente via `tsx` — assim o wrapper `dotenv-cli` que carrega
    // .env.local entra no caminho testado, em vez de depender só do setup
    // do vitest já ter carregado as env vars no processo pai.
    const run = () => execSync(`pnpm import:customers ${FIXTURE_PATH} "${SUPPLIER_NAME}"`, { encoding: 'utf8' });

    const firstOutput = run();
    expect(firstOutput).toContain('Importadas: 2');
    expect(firstOutput).toContain('Recusadas: 1');

    const withPhone = await db.customer.findFirst({ where: { phone: '+5511988887777' } });
    expect(withPhone?.name).toBe('Maria Teste Import');

    const withoutPhone = await db.customer.findFirst({ where: { name: 'Cliente Sem Telefone' } });
    expect(withoutPhone?.phone).toBeNull();

    const subscription = await db.subscription.findFirst({ where: { customerId: withPhone!.id } });
    expect(subscription?.priceCents.toString()).toBe('5000');
    expect(subscription?.costCents.toString()).toBe('2000');
    // 23:59:59.999 de 10/08/2026 em America/Sao_Paulo (UTC-3) cai em 11/08 em UTC.
    expect(subscription?.nextDueAt.toISOString()).toBe('2026-08-11T02:59:59.999Z');
    expect(subscription?.accessUsername).toBe('maria.import');
    // SENHA chega como número na planilha real (123456) — confirma que a
    // credencial revela corretamente de ponta a ponta (import → criptografia → decrypt).
    expect(subscription?.accessPasswordEnc).toBeTruthy();
    expect(decrypt(subscription!.accessPasswordEnc!, 'subscription.accessPassword')).toBe('123456');

    // Segunda rodada — mesmo arquivo, não duplica (checado por accessUsername+fornecedor)
    const secondOutput = run();
    expect(secondOutput).toContain('Puladas (já existiam): 2');

    const count = await db.subscription.count({ where: { customerId: withPhone!.id } });
    expect(count).toBe(1);
  }, 30_000);
});
