import type Decimal from 'decimal.js';
import { marginPercent } from '@/core/money';
import type { ParsedImportRow, ParseRowResult, PhoneIssue } from './workbook';

/**
 * Plano da Etapa 2 (conferência), montado a partir das linhas já parseadas
 * pela MESMA `parseImportRow` que `customer-import.ts` usa para gravar —
 * nenhuma segunda implementação da regra de linha (`.claude/rules/05-reuso.md`).
 * Puro: sem Prisma, sem `new Date()`. `existingUsernames` já vem resolvido do
 * banco numa única query, feita por quem chama.
 */

export interface ImportPlanRow {
  identifier: string;
  username: string | null;
  priceCents: bigint;
  costCents: bigint;
  dueDate: Date;
  phoneIssue: PhoneIssue;
}

export interface ImportPlanRejectedRow {
  identifier: string;
  reason: string;
}

export interface ImportPlan {
  totalRows: number;
  toImport: ImportPlanRow[];
  alreadyExists: ImportPlanRow[];
  rejected: ImportPlanRejectedRow[];
  importTotalCents: bigint;
  averageMarginPercent: Decimal | null;
}

function toPlanRow(data: ParsedImportRow): ImportPlanRow {
  return {
    identifier: data.identifier,
    username: data.username,
    priceCents: data.priceCents,
    costCents: data.costCents,
    dueDate: data.dueDate,
    phoneIssue: data.phoneIssue,
  };
}

type ClassifiedRow =
  | { bucket: 'rejected'; row: ImportPlanRejectedRow }
  | { bucket: 'toImport' | 'alreadyExists'; row: ImportPlanRow };

function classify(parsed: ParseRowResult, existingUsernames: ReadonlySet<string>): ClassifiedRow {
  if (!parsed.ok) return { bucket: 'rejected', row: { identifier: parsed.identifier, reason: parsed.reason } };

  const row = toPlanRow(parsed.data);
  const alreadyExists = row.username !== null && existingUsernames.has(row.username);
  return { bucket: alreadyExists ? 'alreadyExists' : 'toImport', row };
}

function averageMargin(rows: ImportPlanRow[]): Decimal | null {
  const margins = rows
    .map((row) => marginPercent(row.priceCents, row.costCents))
    .filter((margin): margin is Decimal => margin !== null);
  if (margins.length === 0) return null;
  return margins.reduce((sum, margin) => sum.plus(margin)).div(margins.length);
}

export function buildImportPlan(params: {
  parsedRows: ParseRowResult[];
  existingUsernames: ReadonlySet<string>;
}): ImportPlan {
  const toImport: ImportPlanRow[] = [];
  const alreadyExists: ImportPlanRow[] = [];
  const rejected: ImportPlanRejectedRow[] = [];

  for (const parsed of params.parsedRows) {
    const classified = classify(parsed, params.existingUsernames);
    if (classified.bucket === 'rejected') rejected.push(classified.row);
    else if (classified.bucket === 'toImport') toImport.push(classified.row);
    else alreadyExists.push(classified.row);
  }

  return {
    totalRows: params.parsedRows.length,
    toImport,
    alreadyExists,
    rejected,
    importTotalCents: toImport.reduce((sum, row) => sum + row.priceCents, 0n),
    averageMarginPercent: averageMargin(toImport),
  };
}
