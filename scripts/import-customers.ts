/**
 * Importa clientes de uma planilha .xlsx/.xlsm (um arquivo por fornecedor)
 * pra base do sistema. Uso:
 *
 *   pnpm import:customers <arquivo.xlsx-ou-xlsm> "<Nome do Fornecedor>"
 *
 * Casca de CLI só: lê o arquivo, resolve o fornecedor por nome (upsert —
 * conveniência só deste caminho; a tela resolve por um `<Select>` de
 * fornecedores já cadastrados) e delega toda a regra de importação para
 * `app/(app)/customers/customer-import.ts`, a mesma função que a Server
 * Action da tela de Clientes chama. Mapeamento de coluna documentado em
 * docs/superpowers/specs/2026-08-07-etapa-1c-importacao-design.md.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { db } from '@/lib/db';
import { formatCents } from '@/lib/format';
import { readWorkbookRows } from '@/features/customers/import/workbook';
import { importCustomersFromRows } from '@/app/(app)/customers/customer-import';
import type { ImportRowResult, ImportSummary } from '@/features/customers/import/types';

function buildReportLines(supplierName: string, summary: ImportSummary): string[] {
  const withPhoneWarning = summary.imported.filter((r) => r.hasPhoneWarning);
  return [
    `Importação — ${supplierName} — ${new Date().toISOString()}`,
    `Total de linhas: ${summary.totalRows}`,
    `Importadas: ${summary.imported.length}`,
    `Puladas (já existiam): ${summary.skipped.length}`,
    `Recusadas: ${summary.rejected.length}`,
    `Soma importada: R$ ${formatCents(summary.importedTotalCents)}`,
    '',
    'Recusadas:',
    ...summary.rejected.map((r: ImportRowResult) => `  - ${r.identifier}: ${r.reason}`),
    '',
    'Importadas com ressalva (telefone informado mas inválido):',
    ...(withPhoneWarning.length ? withPhoneWarning.map((r) => `  - ${r.identifier}`) : ['  (nenhuma)']),
  ];
}

async function main() {
  const [, , filePath, supplierName] = process.argv;
  if (!filePath || !supplierName) {
    console.error('Uso: pnpm import:customers <arquivo.xlsx-ou-xlsm> "<Nome do Fornecedor>"');
    process.exit(1);
  }

  const buffer = readFileSync(filePath);
  const rows = readWorkbookRows(buffer);

  const settings = await db.settings.findUniqueOrThrow({ where: { id: 'singleton' } });
  const supplier = await db.supplier.upsert({
    where: { name: supplierName },
    update: {},
    create: { name: supplierName },
  });

  const summary = await importCustomersFromRows({ rows, supplierId: supplier.id, timezone: settings.timezone });

  const reportLines = buildReportLines(supplierName, summary);
  const reportDir = './tmp';
  mkdirSync(reportDir, { recursive: true });
  const reportPath = `${reportDir}/import-report-${Date.now()}.txt`;
  writeFileSync(reportPath, reportLines.join('\n'));
  console.log(reportLines.join('\n'));
  console.log(`\nRelatório salvo em ${reportPath}`);

  await db.$disconnect();
}

main().catch((err) => {
  console.error('[import] falhou:', err);
  process.exit(1);
});
