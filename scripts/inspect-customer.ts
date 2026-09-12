/**
 * Raio-x de um cliente pelo nome — assinatura, cobranças e pagamentos, na
 * ordem em que aconteceram. Existe para sair do "pelo vídeo parece que" e
 * olhar o dado quando o operador relata um caso específico.
 *
 * Uso:
 *
 *   pnpm inspect:customer "Walderi"
 *
 * ⚠️ Não imprime credencial de acesso do assinante — os campos nem são
 * selecionados na query (CLAUDE.md §Segurança).
 */
import { db } from '@/lib/db';
import { formatCents } from '@/lib/format';

function day(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function main() {
  const term = process.argv.slice(2).filter((arg) => !arg.startsWith('--')).join(' ').trim();
  if (!term) {
    console.error('Informe parte do nome: pnpm inspect:customer "Walderi"');
    process.exit(1);
  }

  const customers = await db.customer.findMany({
    where: { name: { contains: term, mode: 'insensitive' } },
    select: {
      id: true,
      name: true,
      optedOut: true,
      deletedAt: true,
      subscriptions: {
        select: {
          id: true, status: true, cycle: true, priceCents: true, costCents: true, screens: true,
          nextDueAt: true, planId: true, plan: { select: { name: true, priceCents: true, costCents: true } },
        },
      },
      charges: {
        orderBy: { dueAt: 'asc' },
        select: {
          id: true, status: true, principalCents: true, discountCents: true, costCents: true,
          dueAt: true, payments: { select: { amountCents: true, paidAt: true } },
        },
      },
    },
  });

  if (customers.length === 0) {
    console.log(`Nenhum cliente com "${term}" no nome.`);
    await db.$disconnect();
    return;
  }

  for (const customer of customers) {
    console.log(`\n=== ${customer.name} ===`);
    if (customer.optedOut) console.log('  ⚠️ opt-out ativo');
    if (customer.deletedAt) console.log('  ⚠️ removido');

    for (const sub of customer.subscriptions) {
      const plano = sub.plan
        ? `${sub.plan.name} (plano: ${formatCents(sub.plan.priceCents)} / custo ${formatCents(sub.plan.costCents)})`
        : 'sem plano';
      console.log(
        `  assinatura ${sub.status} ${sub.cycle} — preço ${formatCents(sub.priceCents)}, custo ${formatCents(sub.costCents)}, TELAS ${sub.screens} — ${plano} — próximo venc. ${day(sub.nextDueAt)}`,
      );
    }

    for (const charge of customer.charges) {
      const pago = charge.payments.reduce((sum, p) => sum + p.amountCents, 0n);
      const liquido = charge.principalCents - charge.discountCents;
      console.log(
        `  cobrança ${day(charge.dueAt)} ${charge.status.padEnd(14)} principal ${formatCents(charge.principalCents)} · desc ${formatCents(charge.discountCents)} · líquido ${formatCents(liquido)} · pago ${formatCents(pago)} · custo ${formatCents(charge.costCents)}`,
      );
      for (const payment of charge.payments) {
        console.log(`      pagamento ${formatCents(payment.amountCents)} em ${day(payment.paidAt)}`);
      }
    }
  }

  await db.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await db.$disconnect();
  process.exit(1);
});
