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
  hasPhoneWarning?: boolean;
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
  hasPhoneWarning?: boolean;
}

export interface ImportSummaryDTO {
  totalRows: number;
  imported: ImportRowResultDTO[];
  skipped: ImportRowResultDTO[];
  rejected: ImportRowResultDTO[];
  importedTotalCents: string;
}

/**
 * Retorno da Server Action de importação. Fica aqui, não em `app/`: o
 * componente cliente (`features/customers/components/import-customers-dialog.tsx`)
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
