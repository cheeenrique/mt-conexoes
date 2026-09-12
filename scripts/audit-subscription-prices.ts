/**
 * Lista as assinaturas cujo preço cadastrado não bate com o que o cliente de
 * fato paga — o retrato do estrago que o campo de dinheiro somando dígito por
 * cima deixou na base (ver `components/ui/currency-input.tsx`).
 *
 * Uso:
 *
 *   pnpm audit:prices
 *
 * Só lê. A correção é caso a caso na tela, porque só o operador sabe o preço
 * combinado: ficha → "Valor cobrado por ciclo" → e, na cobrança em aberto,
 * "Atualizar valor pelo plano" (sem pagamento) ou "Dar baixa no restante"
 * (com pagamento parcial já registrado).
 */
import { db } from '@/lib/db';
import { formatCents } from '@/lib/format';
import { findPriceSuspicions } from '@/features/subscriptions/price-audit';

const REASON_LABEL = {
  paga_muito_menos: 'paga bem menos que o cadastrado',
  margem_implausivel: 'margem alta demais, sem histórico de pagamento',
} as const;

async function main() {
  const subscriptions = await db.subscription.findMany({
    where: { status: { not: 'CANCELLED' } },
    select: {
      id: true,
      priceCents: true,
      costCents: true,
      customer: { select: { name: true } },
      charges: { select: { payments: { select: { amountCents: true } } } },
    },
  });

  const suspicions = findPriceSuspicions(
    subscriptions.map((sub) => ({
      id: sub.id,
      customerName: sub.customer.name,
      priceCents: sub.priceCents,
      costCents: sub.costCents,
      paymentsCents: sub.charges.flatMap((charge) => charge.payments.map((payment) => payment.amountCents)),
    })),
  );

  console.log(`Assinaturas vivas conferidas: ${subscriptions.length}`);
  console.log(`Com preço suspeito: ${suspicions.length}\n`);

  for (const row of suspicions) {
    const paga =
      row.typicalPaymentCents === null
        ? 'nunca pagou'
        : `paga ${formatCents(row.typicalPaymentCents)} (${row.ratio?.toFixed(0)}x menos)`;
    console.log(
      `  - ${row.customerName} — cadastrado ${formatCents(row.priceCents)}, ${paga} — ${REASON_LABEL[row.reason]}`,
    );
  }

  if (suspicions.length > 0) {
    console.log('\nCorrigir na ficha do cliente ("Valor cobrado por ciclo"). Depois, na cobrança em aberto:');
    console.log('  sem pagamento  → "Atualizar valor pelo plano"');
    console.log('  com pagamento  → "Dar baixa no restante"');
  }

  await db.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await db.$disconnect();
  process.exit(1);
});
