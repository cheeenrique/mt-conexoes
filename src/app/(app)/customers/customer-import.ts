import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { resolveImportedCustomer } from '@/features/customers/service';
import { createImportedSubscription, findImportedSubscriptionBySupplier } from '@/features/subscriptions/service';
import { parseImportRow, readWorkbookRows, type ParseRowResult } from '@/features/customers/import/workbook';
import { buildImportPlan, type ImportPlan } from '@/features/customers/import/plan';
import { ImportFileEmptyError, ImportSupplierNotFoundError } from '@/features/customers/import/errors';
import type { ImportRowResult, ImportSummary } from '@/features/customers/import/types';

/**
 * Importação da planilha de clientes. Mora em `app/` porque cruza `customers`
 * e `subscriptions` — a mesma razão de `customer-onboarding.ts`
 * (`.claude/rules/01-arquitetura.md` §Matriz de import). É a fonte única
 * consumida pelo script `pnpm import:customers`, pela Server Action de
 * confirmação e pela de prévia (`app/(app)/customers/import/`): nenhuma
 * reimplementa a regra de linha — todas passam por `parseImportRow`.
 */

const IMPORT_BATCH_SIZE = 500;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

function phoneWarningSuffix(hasWarning: boolean): string {
  return hasWarning ? ' (telefone informado mas inválido, importado sem telefone)' : '';
}

async function importRow(
  tx: Prisma.TransactionClient,
  rawRow: Record<string, unknown>,
  supplierId: string,
  timezone: string,
  now: Date,
): Promise<ImportRowResult> {
  const parsed = parseImportRow(rawRow, timezone, now);
  if (!parsed.ok) return { status: 'rejected', identifier: parsed.identifier, reason: parsed.reason };

  const { data } = parsed;

  // Idempotência checada ANTES de tocar em Customer — telefone nulo não
  // serve de chave de upsert (design da Etapa 1c, §Idempotência).
  if (data.username) {
    const existing = await findImportedSubscriptionBySupplier(tx, { supplierId, accessUsername: data.username });
    if (existing) return { status: 'skipped', identifier: data.identifier };
  }

  const customer = await resolveImportedCustomer(tx, { name: data.name, phone: data.phone });

  await createImportedSubscription(tx, {
    customerId: customer.id,
    supplierId,
    priceCents: data.priceCents,
    costCents: data.costCents,
    nextDueAt: data.dueDate,
    startedAt: data.startedAt,
    accessUsername: data.username,
    accessPassword: data.password,
    screens: data.screens,
  });

  return {
    status: 'imported',
    identifier: data.identifier + phoneWarningSuffix(data.phoneWasInvalid),
    priceCents: data.priceCents,
    hasPhoneWarning: data.phoneWasInvalid,
  };
}

function summarize(totalRows: number, results: ImportRowResult[]): ImportSummary {
  const imported = results.filter((r) => r.status === 'imported');
  const skipped = results.filter((r) => r.status === 'skipped');
  const rejected = results.filter((r) => r.status === 'rejected');
  const importedTotalCents = imported.reduce((sum, r) => sum + (r.priceCents ?? 0n), 0n);
  return { totalRows, imported, skipped, rejected, importedTotalCents };
}

/**
 * Processa as linhas já lidas da planilha. Lote de ~500 linhas por
 * transação (`.claude/rules/03-dados.md`) — nunca uma transação só para o
 * arquivo inteiro, mesmo que hoje a planilha real tenha 28 linhas.
 */
export async function importCustomersFromRows(params: {
  rows: Record<string, unknown>[];
  supplierId: string;
  timezone: string;
  now?: Date;
}): Promise<ImportSummary> {
  const supplier = await db.supplier.findUnique({ where: { id: params.supplierId }, select: { id: true } });
  if (!supplier) throw new ImportSupplierNotFoundError();

  const now = params.now ?? new Date();
  const results: ImportRowResult[] = [];

  for (const block of chunk(params.rows, IMPORT_BATCH_SIZE)) {
    await db.$transaction(async (tx) => {
      for (const row of block) {
        results.push(await importRow(tx, row, params.supplierId, params.timezone, now));
      }
    });
  }

  return summarize(params.rows.length, results);
}

/** Ponto de entrada da Server Action de confirmação: recebe o arquivo já validado pelo Zod da tela. */
export async function importCustomersFromUpload(params: { supplierId: string; file: File }): Promise<ImportSummary> {
  const buffer = Buffer.from(await params.file.arrayBuffer());
  const rows = readWorkbookRows(buffer);
  if (rows.length === 0) throw new ImportFileEmptyError();

  const settings = await getSettings();
  return importCustomersFromRows({ rows, supplierId: params.supplierId, timezone: settings.timezone });
}

function collectCandidateUsernames(parsedRows: ParseRowResult[]): string[] {
  return parsedRows.flatMap((row) => (row.ok && row.data.username ? [row.data.username] : []));
}

/**
 * Mesma checagem de idempotência de `findImportedSubscriptionBySupplier`, em
 * lote — a prévia precisa saber quais `accessUsername` já existem para a
 * planilha inteira numa query só. Uma chamada por linha aqui seria N+1
 * disfarçado (`.claude/rules/03-dados.md` §Índices e performance).
 */
async function findExistingUsernames(supplierId: string, usernames: string[]): Promise<Set<string>> {
  if (usernames.length === 0) return new Set();
  const rows = await db.subscription.findMany({
    where: { supplierId, accessUsername: { in: usernames } },
    select: { accessUsername: true },
  });
  return new Set(rows.flatMap((row) => (row.accessUsername ? [row.accessUsername] : [])));
}

/**
 * Prévia da Etapa 2 — parseia com a MESMA `parseImportRow` do caminho que
 * grava, resolve quais `accessUsername` já existem naquele fornecedor numa
 * única query (sem N+1) e devolve o plano puro de `plan.ts`. Não escreve
 * nada: é o que garante a conferência sem efeito colateral.
 */
export async function previewCustomersImport(params: {
  rows: Record<string, unknown>[];
  supplierId: string;
  timezone: string;
  now?: Date;
}): Promise<ImportPlan> {
  const supplier = await db.supplier.findUnique({ where: { id: params.supplierId }, select: { id: true } });
  if (!supplier) throw new ImportSupplierNotFoundError();

  const now = params.now ?? new Date();
  const parsedRows = params.rows.map((row) => parseImportRow(row, params.timezone, now));
  const existingUsernames = await findExistingUsernames(params.supplierId, collectCandidateUsernames(parsedRows));

  return buildImportPlan({ parsedRows, existingUsernames });
}

/** Ponto de entrada da Server Action de prévia: mesmo `File` que a confirmação recebe depois. */
export async function previewCustomersImportFromUpload(
  params: { supplierId: string; file: File },
): Promise<{ fileName: string; plan: ImportPlan }> {
  const buffer = Buffer.from(await params.file.arrayBuffer());
  const rows = readWorkbookRows(buffer);
  if (rows.length === 0) throw new ImportFileEmptyError();

  const settings = await getSettings();
  const plan = await previewCustomersImport({ rows, supplierId: params.supplierId, timezone: settings.timezone });
  return { fileName: params.file.name, plan };
}
