import type { Prisma } from '@prisma/client';
import { deriveChargeStatus, hasOldPlanAmount } from '@/core/billing';
import { localDateOnly } from '@/core/dates';

/** Cobrança que ainda pesa no cliente — o mesmo recorte de `features/customers/list-filters.ts`. */
const OPEN_CHARGE_STATUSES = ['OPEN', 'OVERDUE', 'PARTIALLY_PAID'] as const;

/**
 * O vencimento editado na ficha move junto a cobrança em aberto do ciclo
 * corrente. Sem isto, a ficha mostrava `subscription.nextDueAt` e a lista de
 * Clientes, a escada de vencimento e a régua mostravam `charge.dueAt` — duas
 * datas para o mesmo conceito, e "renovei o cliente" não mudava nada na tela
 * nem parava a cobrança automática (relatado pelo operador em 11/09/2026).
 *
 * ⚠️ Só toca cobrança **sem pagamento registrado**: com dinheiro registrado ela
 * é documento financeiro e não se edita (CLAUDE.md §Dinheiro) — nesse caso a
 * correção é registro novo. Valor e custo continuam congelados na emissão em
 * todos os casos: o que o cliente já recebeu por WhatsApp não muda de preço
 * porque o operador mexeu na ficha.
 */
export async function alignOpenChargeDueAt(
  tx: Prisma.TransactionClient,
  params: { subscriptionId: string; dueAt: Date; timezone: string; now: Date },
): Promise<void> {
  const charge = await tx.charge.findFirst({
    where: { subscriptionId: params.subscriptionId, status: { in: [...OPEN_CHARGE_STATUSES] } },
    select: { id: true, dueAt: true, principalCents: true, discountCents: true, payments: { select: { id: true } } },
  });
  if (!charge || charge.payments.length > 0) return;
  if (charge.dueAt.getTime() === params.dueAt.getTime()) return;

  await tx.charge.update({
    where: { id: charge.id },
    data: {
      dueAt: params.dueAt,
      periodEnd: localDateOnly(params.dueAt, params.timezone),
      // Vencimento para a frente devolve a cobrança para OPEN; para trás a
      // marca OVERDUE na hora, em vez de esperar o cron da meia-noite.
      status: deriveChargeStatus({
        netCents: charge.principalCents - charge.discountCents,
        paidCents: 0n,
        dueAt: params.dueAt,
        now: params.now,
      }),
    },
  });

  // A régua congela os dias de atraso no corpo da mensagem na avaliação, e o
  // despacho só recusa cobrança paga ou cancelada — sem isto, o cliente que o
  // operador acabou de repactuar recebia a cobrança do vencimento antigo horas
  // depois. Mesmo commit da cobrança: cancelar depois deixa a janela aberta.
  await tx.message.updateMany({
    where: { chargeId: charge.id, status: 'PENDING' },
    data: { status: 'CANCELLED', cancelReason: 'due_date_changed' },
  });
}

/**
 * A cobrança em aberto que ficou com o valor do plano anterior.
 *
 * `Charge.principalCents` é congelado na emissão e trocar de plano não o
 * reescreve (CLAUDE.md §Dinheiro) — é o certo para reajuste, e era o buraco
 * para troca de plano: a assinatura passava a R$ 35,00 e a cobrança seguia
 * cobrando R$ 90,00 na lista, no diálogo de pagamento e no WhatsApp.
 *
 * Não corrige nada: devolve o que ficou para trás para a tela perguntar, e
 * quem aplica é `realignChargeToSubscription`. Automático seria pior — o
 * reajuste combinado para o próximo ciclo também mexe em `priceCents`, e ali
 * a cobrança corrente está certa. Por isso os chamadores só consultam quando
 * o **plano** muda.
 *
 * ⚠️ Cobrança com pagamento registrado não entra: documento com dinheiro não
 * se reescreve, e `realignChargeToSubscription` a recusaria. Oferecer ali
 * seria oferecer um botão que o service nega — o caminho é a baixa do
 * restante.
 */
export interface StaleOpenCharge {
  chargeId: string;
  /** Valor congelado na emissão, em centavos. */
  fromCents: string;
  /** O que a assinatura diz hoje, em centavos. */
  toCents: string;
}

export async function findOpenChargeWithOldPlanAmount(
  tx: Prisma.TransactionClient,
  params: { subscriptionId: string; priceCents: bigint },
): Promise<StaleOpenCharge | null> {
  const charge = await tx.charge.findFirst({
    where: { subscriptionId: params.subscriptionId, status: { in: [...OPEN_CHARGE_STATUSES] } },
    select: { id: true, principalCents: true, payments: { select: { id: true } } },
  });
  if (!charge || charge.payments.length > 0) return null;
  if (!hasOldPlanAmount({ chargePrincipalCents: charge.principalCents, planPriceCents: params.priceCents })) return null;

  return {
    chargeId: charge.id,
    fromCents: charge.principalCents.toString(),
    toCents: params.priceCents.toString(),
  };
}
