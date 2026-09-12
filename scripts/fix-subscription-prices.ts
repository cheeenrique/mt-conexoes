/**
 * Corrige em lote as assinaturas com preço muito acima do que o cliente de fato
 * paga — o rastro que o campo de dinheiro somando dígito por cima deixou na
 * base (ver `components/ui/currency-input.tsx`).
 *
 * Uso:
 *
 *   pnpm fix:prices            # só lista o que faria, não grava
 *   pnpm fix:prices --apply    # grava
 *
 * Casca de CLI só: a regra vive em `app/(app)/customers/customer-price-fix.ts`,
 * que usa as mesmas ações da tela ("Atualizar valor pelo plano" e "Dar baixa no
 * restante").
 *
 * ⚠️ Ler a prévia inteira antes de aplicar. Para cada cliente com pagamento
 * parcial registrado, o lote **fecha a cobrança em aberto e abre a próxima** —
 * é a correção certa, e é irreversível. `pnpm audit:prices` mostra o mesmo
 * diagnóstico sem a coluna do que seria feito.
 */
import { db } from '@/lib/db';
import { formatCents } from '@/lib/format';
import { fixSuspiciousPrices, type PriceFixOutcome } from '@/app/(app)/customers/customer-price-fix';

const OUTCOME_LABEL: Record<PriceFixOutcome, string> = {
  cobranca_realinhada: 'cobrança em aberto passa a valer o preço novo',
  cobranca_fechada: 'cobrança fecha pelo valor já pago e abre a próxima',
  so_preco: 'só o preço — não há cobrança em aberto',
  sem_historico: 'IGNORADO: nunca pagou, sem histórico para deduzir o preço',
  pagamento_implausivel: 'IGNORADO: o que pagou não cobre o custo — corrigir na mão',
  falhou: 'FALHOU',
};

async function main() {
  const apply = process.argv.includes('--apply');
  const summary = await fixSuspiciousPrices({ apply });

  const IGNORADOS: PriceFixOutcome[] = ['sem_historico', 'pagamento_implausivel'];
  const corrigiveis = [...summary.staleCharges, ...summary.rows].filter((row) => !IGNORADOS.includes(row.outcome));

  function print(row: (typeof summary.rows)[number]) {
    const destino = row.toCents === null ? '—' : formatCents(row.toCents);
    console.log(`  - ${row.customerName}: ${formatCents(row.fromCents)} → ${destino}  [${OUTCOME_LABEL[row.outcome]}]`);
    if (row.error) console.log(`      ${row.error}`);
  }

  console.log(apply ? 'Correção aplicada.' : 'Prévia — nada foi gravado. Rode com --apply para gravar.');
  console.log(`Assinaturas vivas conferidas: ${summary.checked}\n`);

  console.log(`Cobranças que ficaram para trás da assinatura: ${summary.staleCharges.length}`);
  summary.staleCharges.forEach(print);

  console.log(`\nAssinaturas com preço fora do histórico: ${summary.rows.length}`);
  summary.rows.forEach(print);

  if (apply) console.log(`\nCorrigidas: ${summary.applied}`);
  else if (corrigiveis.length > 0) console.log('\nConfira as listas acima. Se estiverem certas: pnpm fix:prices --apply');

  await db.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await db.$disconnect();
  process.exit(1);
});
