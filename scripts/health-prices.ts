/**
 * Raio-x de consistência de valor da base inteira, numa passada só. Existe para
 * fechar o episódio de 12/09/2026, em que a importação trouxe na coluna `VALOR`
 * da planilha um **acumulado de ciclos** em vez da mensalidade: o preço e o
 * custo da cobrança vinham multiplicados pelo mesmo fator (Ph, 1 tela: preço
 * 3x e custo 3x; Walderi: ~61x), o que nenhum erro de digitação produz.
 *
 * Uso:
 *
 *   pnpm health:prices
 *
 * Só lê. Responde três perguntas de uma vez:
 *
 *   1. Sobrou cobrança em aberto fora do preço da assinatura?
 *   2. Sobrou assinatura fora do plano que o operador atribuiu a ela?
 *   3. Sobrou cobrança cujo custo destoa do custo da assinatura?
 *
 * A terceira é a que denuncia o acumulado: custo multiplicado junto com o preço
 * é ciclo somado, não preço errado.
 */
import { db } from '@/lib/db';
import { formatCents } from '@/lib/format';

const RATIO = 2;

function ratio(a: bigint, b: bigint): number {
  return b === 0n ? Infinity : Number(a) / Number(b);
}

async function main() {
  const charges = await db.charge.findMany({
    where: { status: { in: ['OPEN', 'OVERDUE', 'PARTIALLY_PAID'] } },
    select: {
      principalCents: true, costCents: true, dueAt: true,
      customer: { select: { name: true } },
      subscription: { select: { priceCents: true, costCents: true } },
    },
  });

  const subscriptions = await db.subscription.findMany({
    where: { status: { not: 'CANCELLED' }, planId: { not: null } },
    select: {
      priceCents: true, screens: true,
      customer: { select: { name: true } },
      plan: { select: { name: true, priceCents: true } },
    },
  });

  const precoFora = charges.filter((c) => ratio(c.principalCents, c.subscription.priceCents) >= RATIO);
  const custoFora = charges.filter((c) => ratio(c.costCents, c.subscription.costCents) >= RATIO);
  const planoFora = subscriptions.filter((s) => s.plan && s.priceCents !== s.plan.priceCents);

  console.log(`Cobranças em aberto conferidas: ${charges.length}`);
  console.log(`Assinaturas com plano atribuído: ${subscriptions.length}\n`);

  console.log(`1. Cobrança acima do preço da assinatura (${RATIO}x+): ${precoFora.length}`);
  for (const c of precoFora) {
    console.log(`   - ${c.customer.name}: cobrança ${formatCents(c.principalCents)} vs assinatura ${formatCents(c.subscription.priceCents)}`);
  }

  console.log(`\n2. Cobrança com custo acima do custo da assinatura (${RATIO}x+): ${custoFora.length}`);
  for (const c of custoFora) {
    console.log(`   - ${c.customer.name}: custo ${formatCents(c.costCents)} vs assinatura ${formatCents(c.subscription.costCents)}`);
  }

  console.log(`\n3. Assinatura fora do preço do plano que ela aponta: ${planoFora.length}`);
  for (const s of planoFora) {
    console.log(`   - ${s.customer.name}: assinatura ${formatCents(s.priceCents)} vs plano "${s.plan!.name}" ${formatCents(s.plan!.priceCents)} (telas: ${s.screens})`);
  }

  const total = precoFora.length + custoFora.length + planoFora.length;
  console.log(total === 0 ? '\n✅ Base consistente — nada fora do lugar.' : `\n⚠️ ${total} divergências acima.`);

  await db.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await db.$disconnect();
  process.exit(1);
});
