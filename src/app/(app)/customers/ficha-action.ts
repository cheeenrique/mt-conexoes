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

    const [subscriptions, charges, customerMessages, pnl, plans, suppliers] = await Promise.all([
      listSubscriptionsForCustomer(customerId),
      getChargesForCustomer(customerId),
      listMessagesForCustomer(customerId),
      getCustomerPnl(customerId),
      listActivePlansForSelect(),
      listActiveSuppliersForSelect(),
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
