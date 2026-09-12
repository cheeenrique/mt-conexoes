import { db } from '@/lib/db';
import { findPriceSuspicions } from '@/features/subscriptions/price-audit';
import { realignChargeToSubscription, writeOffRemaining } from '@/features/charges/service';

/**
 * Corrige em lote as assinaturas que ficaram com preço muito acima do que o
 * cliente de fato paga — o rastro que o campo de dinheiro somando dígito por
 * cima deixou na base (ver `components/ui/currency-input.tsx`).
 *
 * Mora em `app/` porque cruza `subscriptions` e `charges`
 * (`.claude/rules/01-arquitetura.md` §Matriz de import), e usa as **mesmas**
 * ações da tela — `realignChargeToSubscription` e `writeOffRemaining` — em vez
 * de escrever em `charges` por fora. Correção em massa que diverge do que o
 * botão faz é divergência de valor esperando para acontecer.
 *
 * O preço novo é a **mediana do que o cliente pagou**, e não um palpite: quem
 * pagou R$ 30 nas últimas vezes tem assinatura de R$ 30. Por isso o lote só
 * mexe em quem tem histórico de pagamento; quem nunca pagou aparece no
 * relatório e fica para a mão do operador, porque ali não há de onde tirar o
 * valor certo.
 *
 * ⚠️ **Não é uma transação só.** Cada assinatura são três escritas (preço,
 * cobrança, ciclo seguinte) e um lote grande numa transação só seguraria
 * conexão do Neon por minutos. É idempotente no lugar disso: o que já foi
 * corrigido deixa de ser suspeito e sai da lista na próxima passada.
 */

export type PriceFixOutcome =
  /** Cobrança em aberto sem pagamento: passou a valer o preço novo. */
  | 'cobranca_realinhada'
  /** Cobrança com pagamento parcial: o que faltava virou desconto e o ciclo seguinte abriu. */
  | 'cobranca_fechada'
  /** Preço corrigido, mas não havia cobrança em aberto para acertar. */
  | 'so_preco'
  /** Nunca pagou: sem histórico, o preço certo é desconhecido. */
  | 'sem_historico'
  /** O que ele pagou não chega a cobrir o custo — é pagamento simbólico, não o preço. */
  | 'pagamento_implausivel'
  | 'falhou';

export interface PriceFixRow {
  subscriptionId: string;
  customerName: string;
  fromCents: bigint;
  toCents: bigint | null;
  outcome: PriceFixOutcome;
  error?: string;
}

export interface PriceFixSummary {
  checked: number;
  rows: PriceFixRow[];
  applied: number;
}

/** O que vai acontecer com a cobrança em aberto desta assinatura — lido sem gravar nada,
 *  para a prévia prometer exatamente o que o `--apply` faz. */
async function planOne(subscriptionId: string): Promise<{ chargeId: string | null; outcome: PriceFixOutcome }> {
  const open = await db.charge.findFirst({
    where: { subscriptionId, status: { in: ['OPEN', 'OVERDUE', 'PARTIALLY_PAID'] } },
    select: { id: true, payments: { select: { id: true } } },
  });
  if (!open) return { chargeId: null, outcome: 'so_preco' };
  return { chargeId: open.id, outcome: open.payments.length === 0 ? 'cobranca_realinhada' : 'cobranca_fechada' };
}

async function fixOne(subscriptionId: string, toCents: bigint): Promise<PriceFixOutcome> {
  const plan = await planOne(subscriptionId);

  // Preço primeiro: é dele que a baixa tira o valor do ciclo seguinte.
  await db.subscription.update({ where: { id: subscriptionId }, data: { priceCents: toCents } });

  if (plan.chargeId === null) return 'so_preco';
  if (plan.outcome === 'cobranca_realinhada') await realignChargeToSubscription(plan.chargeId);
  else await writeOffRemaining(plan.chargeId);
  return plan.outcome;
}

export async function fixSuspiciousPrices(params: { apply: boolean }): Promise<PriceFixSummary> {
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

  const rows: PriceFixRow[] = [];
  let applied = 0;

  for (const suspicion of suspicions) {
    const toCents = suspicion.typicalPaymentCents;
    const base = {
      subscriptionId: suspicion.id,
      customerName: suspicion.customerName,
      fromCents: suspicion.priceCents,
      toCents,
    };

    if (toCents === null) {
      rows.push({ ...base, outcome: 'sem_historico' });
      continue;
    }
    // ⚠️ Trava contra estragar a base: revendedor não vende abaixo do custo, então
    // mediana menor que o custo não é o preço — é pagamento simbólico, adiantamento
    // ou lançamento de teste. Sem isso, um pagamento de R$ 0,01 reescreveria a
    // assinatura para R$ 0,01, e o lote causaria mais dano do que conserta.
    if (suspicion.costCents > 0n && toCents <= suspicion.costCents) {
      rows.push({ ...base, outcome: 'pagamento_implausivel' });
      continue;
    }
    if (!params.apply) {
      rows.push({ ...base, outcome: (await planOne(suspicion.id)).outcome });
      continue;
    }

    try {
      rows.push({ ...base, outcome: await fixOne(suspicion.id, toCents) });
      applied += 1;
    } catch (err) {
      // Uma assinatura que falha não derruba o lote: o resto continua, e a
      // próxima passada pega esta de novo.
      rows.push({ ...base, outcome: 'falhou', error: String(err) });
    }
  }

  return { checked: subscriptions.length, rows, applied };
}
