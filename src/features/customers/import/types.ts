import type Decimal from 'decimal.js';
import { marginPercent } from '@/core/money';
import type { ImportPlan, ImportPlanRow } from './plan';
import type { PhoneIssue } from './workbook';

/**
 * Formas compartilhadas entre o parser (`workbook.ts`), a orquestração
 * cross-feature (`app/(app)/customers/customer-import.ts`) e os dois
 * consumidores — o script CLI e a Server Action da tela.
 */
export interface ImportRowResult {
  status: 'imported' | 'skipped' | 'rejected';
  identifier: string;
  reason?: string;
  priceCents?: bigint;
  phoneIssue?: PhoneIssue;
}

export interface ImportSummary {
  totalRows: number;
  imported: ImportRowResult[];
  skipped: ImportRowResult[];
  rejected: ImportRowResult[];
  importedTotalCents: bigint;
}

/** Mesma forma, sem `bigint` — o que a tela recebe. `BigInt` não cruza para componente cliente. */
export interface ImportRowResultDTO {
  status: 'imported' | 'skipped' | 'rejected';
  identifier: string;
  reason?: string;
  priceCents?: string;
  phoneIssue?: PhoneIssue;
}

export interface ImportSummaryDTO {
  totalRows: number;
  imported: ImportRowResultDTO[];
  skipped: ImportRowResultDTO[];
  rejected: ImportRowResultDTO[];
  importedTotalCents: string;
}

/**
 * Retorno da Server Action de confirmação. Fica aqui, não em `app/`: o
 * componente cliente (`features/customers/import/components/import-wizard.tsx`)
 * precisa do tipo, e `features/*` nunca importa de `app/`
 * (`.claude/rules/01-arquitetura.md` §Matriz de import) — só o inverso.
 */
export type ImportCustomersResult = { ok: true; summary: ImportSummaryDTO } | { error: { code: string; message: string } };

function toRowDTO(row: ImportRowResult): ImportRowResultDTO {
  return { ...row, priceCents: row.priceCents !== undefined ? row.priceCents.toString() : undefined };
}

export function toImportSummaryDTO(summary: ImportSummary): ImportSummaryDTO {
  return {
    totalRows: summary.totalRows,
    imported: summary.imported.map(toRowDTO),
    skipped: summary.skipped.map(toRowDTO),
    rejected: summary.rejected.map(toRowDTO),
    importedTotalCents: summary.importedTotalCents.toString(),
  };
}

/**
 * DTO da Etapa 2 (conferência) — mesma regra de "sem `BigInt` pro cliente" e,
 * aqui, sem `Decimal` também: a margem por linha e a média já saem como
 * string pronta pra `formatPercent`. `alreadyExists` vira só contagem — a
 * prévia não lista quem já existe, só recusadas e ressalvas têm detalhe
 * (design da Etapa 2).
 */
export interface ImportPlanRowDTO {
  identifier: string;
  username: string | null;
  priceCents: string;
  costCents: string;
  marginPercent: string | null;
  dueAt: string;
  phoneIssue: PhoneIssue;
}

export interface ImportPlanDTO {
  totalRows: number;
  toImport: ImportPlanRowDTO[];
  alreadyExistsCount: number;
  rejected: { identifier: string; reason: string }[];
  importTotalCents: string;
  averageMarginPercent: string | null;
}

export type PreviewCustomersImportResult =
  | { ok: true; fileName: string; plan: ImportPlanDTO }
  | { error: { code: string; message: string } };

function toDecimalString(value: Decimal | null): string | null {
  return value ? value.toString() : null;
}

function toPlanRowDTO(row: ImportPlanRow): ImportPlanRowDTO {
  return {
    identifier: row.identifier,
    username: row.username,
    priceCents: row.priceCents.toString(),
    costCents: row.costCents.toString(),
    marginPercent: toDecimalString(marginPercent(row.priceCents, row.costCents)),
    dueAt: row.dueDate.toISOString(),
    phoneIssue: row.phoneIssue,
  };
}

export function toImportPlanDTO(plan: ImportPlan): ImportPlanDTO {
  return {
    totalRows: plan.totalRows,
    toImport: plan.toImport.map(toPlanRowDTO),
    alreadyExistsCount: plan.alreadyExists.length,
    rejected: plan.rejected,
    importTotalCents: plan.importTotalCents.toString(),
    averageMarginPercent: toDecimalString(plan.averageMarginPercent),
  };
}
