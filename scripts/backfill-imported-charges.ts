/**
 * Abre a primeira cobrança das assinaturas importadas antes da correção — as
 * que ficaram `ACTIVE` com zero cobrança e por isso apareciam como "Ativo" na
 * lista de Clientes mesmo com vencimento no passado, fora dos chips "Vence
 * hoje"/"Em atraso", fora de /charges e fora da régua.
 *
 * Uso:
 *
 *   pnpm backfill:imported-charges            # só lista o que sairia, não grava
 *   pnpm backfill:imported-charges --apply    # grava
 *
 * Casca de CLI só: toda a regra vive em
 * `app/(app)/customers/customer-charge-backfill.ts`, que emite a cobrança pela
 * mesma `buildImportedFirstCharge` da importação.
 *
 * ⚠️ Depois de aplicar, a base importada passa a existir para a régua. Se o
 * kill switch estiver desligado, o próximo `dunning-evaluate` vai avaliar
 * todos esses vencimentos atrasados de uma vez. Conferir Ajustes antes.
 */
import { db } from '@/lib/db';
import { formatCents } from '@/lib/format';
import { backfillImportedCharges } from '@/app/(app)/customers/customer-charge-backfill';

function formatDueAt(dueAt: Date, timezone: string): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: timezone, dateStyle: 'short' }).format(dueAt);
}

async function main() {
  const apply = process.argv.includes('--apply');

  const settings = await db.settings.findUniqueOrThrow({ where: { id: 'singleton' } });
  const summary = await backfillImportedCharges({ timezone: settings.timezone, apply });

  console.log(apply ? 'Backfill aplicado.' : 'Prévia — nada foi gravado. Rode com --apply para gravar.');
  console.log(`Assinaturas ativas sem nenhuma cobrança: ${summary.candidates.length}`);
  console.log(`Soma das cobranças: ${formatCents(summary.totalCents)}`);
  console.log('');
  for (const row of summary.candidates) {
    console.log(
      `  - ${row.customerName} — vence ${formatDueAt(row.dueAt, settings.timezone)} — ${formatCents(row.priceCents)}`,
    );
  }
  if (apply) console.log(`\nCobranças criadas: ${summary.created}`);

  await db.$disconnect();
}

main().catch((err) => {
  console.error('[backfill:imported-charges] falhou:', err);
  process.exit(1);
});
