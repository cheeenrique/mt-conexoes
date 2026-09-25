import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { recordFinancialEvent } from '@/lib/financial-events';
import { computeChargeDiscount, deriveChargeStatus } from '@/core/billing';
import { ChargeAlreadyPaidError, ChargeHasPaymentError, ChargeNotFoundError } from './errors';

export type ChargeForRealign = Prisma.ChargeGetPayload<{ include: { payments: true; subscription: true } }>;

/**
 * Reemite a cobrança em aberto com o que a assinatura diz hoje: preço, custo e
 * desconto vigente. É a saída para "troquei o plano e a cobrança continua com o
 * valor velho" — é essa cobrança que a régua manda por WhatsApp.
 *
 * Ação explícita, nunca efeito colateral de salvar a ficha: reajuste combinado
 * para o próximo ciclo também mexe em `priceCents`, e ali a cobrança corrente
 * está certa. Só o operador sabe qual dos dois casos é o dele.
 */
export async function realignChargeToSubscription(chargeId: string): Promise<void> {
  const now = new Date();

  await db.$transaction(async (tx) => {
    const charge = await tx.charge.findUnique({ where: { id: chargeId }, include: { payments: true, subscription: true } });
    if (!charge) throw new ChargeNotFoundError();
    await realignChargeWithinTx(tx, charge, now);
  });
}

/**
 * O realinhamento em si, dentro da transação de quem chama. Dois caminhos o
 * usam: o botão "Atualizar valor pelo plano" e o diálogo de pagamento, quando o
 * operador escolhe o valor do plano atual — ali ele vai no mesmo commit do
 * pagamento, senão um crash entre os dois deixa a cobrança com o valor novo e
 * sem o dinheiro que acabou de entrar.
 *
 * Devolve a cobrança já com os valores novos, para o chamador seguir a conta.
 *
 * ⚠️ Recusa cobrança com pagamento registrado (documento com dinheiro não se
 * reescreve — CLAUDE.md §Dinheiro). Nesse caso o caminho é a baixa do restante.
 */
export async function realignChargeWithinTx(
  tx: Prisma.TransactionClient,
  charge: ChargeForRealign,
  now: Date,
): Promise<ChargeForRealign> {
  if (charge.status === 'PAID') throw new ChargeAlreadyPaidError();
  if (charge.status === 'CANCELLED') throw new ChargeNotFoundError();
  if (charge.payments.length > 0) throw new ChargeHasPaymentError();

  const { priceCents, costCents } = charge.subscription;
  const discountCents = computeChargeDiscount(charge.subscription, charge.periodStart);

  const updated = await tx.charge.update({
    where: { id: charge.id },
    data: {
      principalCents: priceCents,
      costCents,
      discountCents,
      status: deriveChargeStatus({ netCents: priceCents - discountCents, paidCents: 0n, dueAt: charge.dueAt, now }),
    },
  });

  await recordFinancialEvent(tx, {
    customerId: charge.customerId,
    entityType: 'CHARGE',
    entityId: charge.id,
    kind: 'CHARGE_REALIGNED',
    before: {
      principalCents: charge.principalCents.toString(),
      costCents: charge.costCents.toString(),
      discountCents: charge.discountCents.toString(),
    },
    after: {
      principalCents: priceCents.toString(),
      costCents: costCents.toString(),
      discountCents: discountCents.toString(),
    },
  });

  await cancelPendingMessages(tx, charge.id);
  return { ...charge, ...updated };
}

/**
 * A régua congela o valor no corpo da mensagem na avaliação e o despacho
 * nunca recalcula (`dunning/message-build.ts`). Sem isto, a cobrança
 * realinhada para R$ 30,00 ainda sairia por R$ 100,00 no WhatsApp horas
 * depois — mesmo motivo de `alignOpenChargeDueAt` cancelar quando o
 * vencimento muda. Mesmo commit: cancelar depois deixa a janela aberta.
 */
async function cancelPendingMessages(tx: Prisma.TransactionClient, chargeId: string): Promise<void> {
  const cancelledMessages = await tx.message.findMany({
    where: { chargeId, status: 'PENDING' },
    select: { id: true },
  });
  await tx.message.updateMany({
    where: { chargeId, status: 'PENDING' },
    data: { status: 'CANCELLED', cancelReason: 'amount_changed' },
  });
  // A execução da régua some junto (mesmo motivo do stale T8 em
  // `messaging/scheduled-dispatch.ts`): `DunningExecution` afirma "este
  // passo já foi processado para esta cobrança", e o `UNIQUE(chargeId,
  // stepId)` faz a régua acreditar. Uma mensagem cancelada aqui nunca
  // chegou a sair pelo WhatsApp — o passo foi planejado, não executado.
  // Deixar a linha em pé bloqueia a reavaliação daquele par para sempre.
  if (cancelledMessages.length > 0) {
    await tx.dunningExecution.deleteMany({
      where: { messageId: { in: cancelledMessages.map((m) => m.id) } },
    });
  }
}
