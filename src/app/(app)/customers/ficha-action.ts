'use server';

import { requireSession } from '@/lib/auth';
import { getCustomerHead } from '@/features/customers/queries';
import { listSubscriptionsForCustomer, type SubscriptionDTO } from '@/features/subscriptions/queries';
import { getChargesForCustomer } from '@/features/charges/queries';
import { listMessagesForCustomer } from '@/features/messaging/queries';
import { getCustomerPnl } from '@/features/reports/queries';
import { listActivePlansForSelect } from '@/features/plans/queries';
import { listActiveSuppliersForSelect } from '@/features/suppliers/queries';
import { revealCredentialAction } from '@/features/subscriptions/actions';
import { getSettings } from '@/lib/settings';
import { logger } from '@/lib/logger';
import { messages } from '@/lib/messages';
import { listFinancialEvents } from '@/lib/financial-events';
import { formatCents } from '@/lib/format';
import type {
  CustomerFichaData,
  FichaPaymentDTO,
  LoadCustomerFicha,
  RevealAccessPassword,
} from '@/features/customers/ficha-types';

/** Assinatura que a ficha mostra: a ativa; na falta dela, a suspensa; senão a mais recente. */
const STATUS_RANK: Record<string, number> = { ACTIVE: 0, SUSPENDED: 1, CANCELLED: 2 };

function pickSubscription(subscriptions: SubscriptionDTO[]): SubscriptionDTO | null {
  if (subscriptions.length === 0) return null;
  return [...subscriptions].sort((a, b) => (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9))[0];
}

/** Resumo legível de um evento. Mora em `app/` com o resto da composição da
 *  ficha: é apresentação, não regra — e é aqui que o payload achatado volta a
 *  virar frase em pt-BR. */
function eventSummary(event: { kind: string; before: Record<string, string | null> | null; after: Record<string, string | null> | null }): string {
  const before = event.before ?? {};
  const after = event.after ?? {};

  const money = (from: string | null | undefined, to: string | null | undefined) =>
    from && to ? `${formatCents(from)} → ${formatCents(to)}` : '';

  switch (event.kind) {
    case 'SUBSCRIPTION_PLAN_CHANGED':
    case 'SUBSCRIPTION_PRICE_EDITED':
    case 'CHARGE_AMOUNT_EDITED':
      return money(before.priceCents ?? before.principalCents, after.priceCents ?? after.principalCents);
    case 'CHARGE_REALIGNED':
      return money(before.principalCents, after.principalCents);
    case 'CHARGE_WRITTEN_OFF':
      return money(before.discountCents, after.discountCents);
    case 'PAYMENT_REGISTERED':
    case 'PAYMENT_REMOVED':
      return after.amountCents ? formatCents(after.amountCents) : formatCents(before.amountCents ?? '0');
    case 'SUBSCRIPTION_DUE_DATE_EDITED':
      return `${before.nextDueAt ?? ''} → ${after.nextDueAt ?? ''}`;
    default:
      return `${before.cycle ?? before.status ?? ''} → ${after.cycle ?? after.status ?? ''}`;
  }
}

/**
 * Monta a ficha do cliente a partir das queries de cinco features. Mora em
 * `app/` porque é a única camada autorizada a cruzar features
 * (`.claude/rules/01-arquitetura.md` §Matriz de import) — o drawer recebe esta
 * função por prop, o que também é o que permite abri-lo de Início, Cobranças e
 * Mensagens sem cada tela ter cópia própria da ficha.
 */
export async function loadCustomerFichaAction(
  ...args: Parameters<LoadCustomerFicha>
): ReturnType<LoadCustomerFicha> {
  const [customerId] = args;
  try {
    await requireSession();
    const settings = await getSettings();
    const head = await getCustomerHead(customerId, new Date(), settings.timezone);
    if (!head) return { error: { code: 'CUSTOMER_NOT_FOUND', message: 'Cliente não encontrado.' } };

    const [subscriptions, charges, customerMessages, pnl, plans, suppliers, events] = await Promise.all([
      listSubscriptionsForCustomer(customerId),
      getChargesForCustomer(customerId),
      listMessagesForCustomer(customerId),
      getCustomerPnl(customerId),
      listActivePlansForSelect(),
      listActiveSuppliersForSelect(),
      listFinancialEvents(customerId),
    ]);

    const subscription = pickSubscription(subscriptions);
    const payments: FichaPaymentDTO[] = charges
      .flatMap((charge) =>
        charge.payments.map((payment) => ({
          id: payment.id,
          paidAt: payment.paidAt,
          method: payment.method,
          amountCents: payment.amountCents,
          chargeStatus: charge.status,
        })),
      )
      .sort((a, b) => b.paidAt.localeCompare(a.paidAt));

    const data: CustomerFichaData = {
      id: head.id,
      name: head.name,
      phone: head.phone,
      email: head.email,
      document: head.document,
      notes: head.notes,
      situation: head.situation,
      daysFromDue: head.daysFromDue,
      optedOut: head.optedOut,
      optedOutAt: head.optedOutAt,
      optedOutReason: head.optedOutReason,
      supplierName: head.supplierName,
      sinceAt: head.sinceAt,
      timezone: settings.timezone,
      billedCents: pnl.billedCents,
      receivedCents: pnl.receivedCents,
      costCents: pnl.costCents,
      renewalCount: pnl.paidCount,
      subscription: subscription
        ? {
            id: subscription.id,
            planId: subscription.planId,
            supplierId: subscription.supplierId,
            planName: subscription.planName,
            supplierName: subscription.supplierName,
            cycle: subscription.cycle,
            status: subscription.status,
            priceCents: subscription.priceCents,
            costCents: subscription.costCents,
            nextDueAt: subscription.nextDueAt,
            screens: subscription.screens,
            accessUsername: subscription.accessUsername,
            hasAccessPassword: subscription.hasAccessPassword,
          }
        : null,
      plans,
      suppliers,
      payments,
      messages: customerMessages.map((message) => ({
        id: message.id,
        status: message.status,
        body: message.body,
        at: message.sentAt ?? message.createdAt,
        failReason: message.failReason,
        cancelReason: message.cancelReason,
      })),
      events: events.map((event) => ({
        id: event.id,
        kind: event.kind,
        summary: eventSummary(event),
        reason: event.reason,
        at: event.at.toISOString(),
      })),
    };

    return { data };
  } catch (err) {
    logger.error({
      route: 'customers.ficha',
      customerId,
      error: String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return { error: { code: 'UNEXPECTED', message: messages.common.unexpectedError } };
  }
}

/** Repasse da revelação auditada de `features/subscriptions` para a ficha. */
export const revealAccessPasswordAction: RevealAccessPassword = revealCredentialAction;
