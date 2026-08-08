/**
 * Importa clientes de uma planilha .xlsx/.xlsm (um arquivo por fornecedor)
 * pra base do sistema. Uso:
 *
 *   pnpm import:customers <arquivo.xlsx-ou-xlsm> "<Nome do Fornecedor>"
 *
 * Mapeamento de coluna confirmado contra o arquivo real
 * (Planilha para cadastro de Clientes UNIPLAY 2026.xlsm) — documentado em
 * docs/superpowers/specs/2026-08-07-etapa-1c-importacao-design.md. Ajuste o
 * objeto COLUMN abaixo se um fornecedor diferente usar nomes de coluna
 * diferentes.
 */
import { writeFileSync } from 'node:fs';
import { readFile, utils } from 'xlsx';
import { config } from 'dotenv';
import { db } from '@/lib/db';
import { createImportedSubscription, findImportedSubscriptionBySupplier } from '@/features/subscriptions/service';
import { normalizePhoneBR, parseCentsFromBR, parseDateBR } from './import/parse-row';

config({ path: '.env.local' });

// Nomes de coluna confirmados contra o arquivo real. `trim()` aplicado na
// hora de ler o cabeçalho — a planilha real tem espaço em branco em alguns
// nomes (" VALOR ", "  WHATSAPP").
const COLUMN = {
  name: ['CODIGO', 'CÓDIGO', 'NOME'],
  phone: ['WHATSAPP', 'TELEFONE', 'CONTATO'],
  username: ['USUARIO', 'USUÁRIO'],
  password: ['SENHA'],
  startedAt: ['CRIAÇÃO', 'CRIACAO', 'DATA DE CRIAÇÃO'],
  dueDate: ['VALIDADE', 'VENCIMENTO', 'DATA DE VENCIMENTO'],
  screens: ['TELAS'],
  cost: ['CUSTO'],
  price: ['VALOR'],
} as const;

function normalizeHeaders(row: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    normalized[key.trim().toUpperCase()] = value;
  }
  return normalized;
}

function pick(row: Record<string, unknown>, candidates: readonly string[]): unknown {
  for (const key of candidates) {
    if (row[key] !== undefined && row[key] !== '') return row[key];
  }
  return undefined;
}

interface ImportResult {
  status: 'imported' | 'skipped' | 'rejected';
  identifier: string;
  reason?: string;
  priceCents?: bigint;
}

async function importRow(rawRow: Record<string, unknown>, supplierId: string): Promise<ImportResult> {
  const row = normalizeHeaders(rawRow);

  const rawName = pick(row, COLUMN.name);
  const name = typeof rawName === 'string' ? rawName.trim() : String(rawName ?? '').trim();
  const identifier = name || '(sem nome)';

  if (!name) return { status: 'rejected', identifier, reason: 'Nome ausente.' };

  const rawDue = pick(row, COLUMN.dueDate);
  const dueDate = rawDue !== undefined ? parseDateBR(rawDue as string | number | Date) : null;
  if (!dueDate) return { status: 'rejected', identifier, reason: 'Data de vencimento ausente ou inválida.' };

  const rawPrice = pick(row, COLUMN.price);
  const priceCents = rawPrice !== undefined ? parseCentsFromBR(rawPrice as string | number) : null;
  if (priceCents === null) return { status: 'rejected', identifier, reason: 'Valor do serviço ausente, inválido ou negativo.' };

  const rawCost = pick(row, COLUMN.cost);
  const costCents = rawCost !== undefined ? (parseCentsFromBR(rawCost as string | number) ?? 0n) : 0n;

  const rawStarted = pick(row, COLUMN.startedAt);
  const startedAt = rawStarted !== undefined ? (parseDateBR(rawStarted as string | number | Date) ?? new Date()) : new Date();

  const rawUsername = pick(row, COLUMN.username);
  const username = rawUsername !== undefined ? String(rawUsername).trim() || null : null;

  const rawPassword = pick(row, COLUMN.password);
  const password = rawPassword !== undefined ? String(rawPassword).trim() || null : null;

  const screensRaw = pick(row, COLUMN.screens);
  const screens = typeof screensRaw === 'number' ? Math.max(1, Math.floor(screensRaw)) : 1;

  const rawPhone = pick(row, COLUMN.phone);
  const phone = typeof rawPhone === 'string' ? normalizePhoneBR(rawPhone) : null;
  const phoneNoteSuffix = rawPhone && !phone ? ' (telefone informado mas inválido, importado sem telefone)' : '';

  // Idempotência checada ANTES de criar/tocar em Customer — ver Task 3.
  if (username) {
    const existing = await findImportedSubscriptionBySupplier({ supplierId, accessUsername: username });
    if (existing) return { status: 'skipped', identifier };
  }

  const customer = phone
    ? await db.customer.upsert({ where: { phone }, update: {}, create: { name, phone } })
    : await db.customer.create({ data: { name, phone: null } });

  await createImportedSubscription({
    customerId: customer.id,
    supplierId,
    priceCents,
    costCents,
    nextDueAt: dueDate,
    startedAt,
    accessUsername: username,
    accessPassword: password,
    screens,
  });

  return { status: 'imported', identifier: identifier + phoneNoteSuffix, priceCents };
}

async function main() {
  const [, , filePath, supplierName] = process.argv;
  if (!filePath || !supplierName) {
    console.error('Uso: pnpm import:customers <arquivo.xlsx-ou-xlsm> "<Nome do Fornecedor>"');
    process.exit(1);
  }

  const workbook = readFile(filePath, { cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: undefined });

  const supplier = await db.supplier.upsert({
    where: { name: supplierName },
    update: {},
    create: { name: supplierName },
  });

  const results: ImportResult[] = [];
  for (const row of rows) {
    results.push(await importRow(row, supplier.id));
  }

  const imported = results.filter((r) => r.status === 'imported');
  const skipped = results.filter((r) => r.status === 'skipped');
  const rejected = results.filter((r) => r.status === 'rejected');
  const importedTotalCents = imported.reduce((sum, r) => sum + (r.priceCents ?? 0n), 0n);

  const reportLines = [
    `Importação — ${supplierName} — ${new Date().toISOString()}`,
    `Total de linhas: ${rows.length}`,
    `Importadas: ${imported.length}`,
    `Puladas (já existiam): ${skipped.length}`,
    `Recusadas: ${rejected.length}`,
    `Soma importada: R$ ${(Number(importedTotalCents) / 100).toFixed(2)}`,
    '',
    'Recusadas:',
    ...rejected.map((r) => `  - ${r.identifier}: ${r.reason}`),
  ];

  const reportPath = `import-report-${Date.now()}.txt`;
  writeFileSync(reportPath, reportLines.join('\n'));
  console.log(reportLines.join('\n'));
  console.log(`\nRelatório salvo em ${reportPath}`);

  await db.$disconnect();
}

main().catch((err) => {
  console.error('[import] falhou:', err);
  process.exit(1);
});
