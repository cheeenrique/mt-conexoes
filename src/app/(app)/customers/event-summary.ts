import { formatCents } from '@/lib/format';
import { CHARGE_STATUS_LABELS, CYCLE_LABELS, SUBSCRIPTION_STATUS_LABELS } from '@/lib/labels';

/** `YYYY-MM-DD` local vira `DD/MM/YYYY` sem passar por fuso de novo — já é
 *  data local do negócio (`core/subscription-events.ts`), reconverter
 *  duplicaria a regra de fuso que `core/dates.ts` já aplicou uma vez. */
function formatLocalDateParts(value: string | null | undefined): string {
  if (!value) return '';
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

/**
 * Resumo legível de um evento do histórico financeiro. Módulo próprio, sem
 * depender de `ficha-action.ts`: é apresentação pura (sem Prisma, sem sessão,
 * sem I/O) e testá-la direto é mais barato que subir a ficha inteira — a
 * action arrasta `features/subscriptions/service.ts`, que lê `CREDENTIAL_KEY`
 * na importação.
 *
 * Todo enum do Prisma passa pelo mapa de rótulos de `lib/labels.ts` antes de
 * chegar na tela (CLAUDE.md, `.claude/rules/04-frontend.md` — sem mistura de
 * idioma na UI).
 */
export function eventSummary(event: { kind: string; before: Record<string, string | null> | null; after: Record<string, string | null> | null }): string {
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
      return `${formatLocalDateParts(before.nextDueAt)} → ${formatLocalDateParts(after.nextDueAt)}`;
    case 'SUBSCRIPTION_CYCLE_CHANGED':
      return `${CYCLE_LABELS[before.cycle ?? ''] ?? before.cycle ?? ''} → ${CYCLE_LABELS[after.cycle ?? ''] ?? after.cycle ?? ''}`;
    case 'SUBSCRIPTION_STATUS_CHANGED':
      return `${SUBSCRIPTION_STATUS_LABELS[before.status ?? ''] ?? before.status ?? ''} → ${SUBSCRIPTION_STATUS_LABELS[after.status ?? ''] ?? after.status ?? ''}`;
    case 'CHARGE_CANCELLED':
      return `${CHARGE_STATUS_LABELS[before.status ?? ''] ?? before.status ?? ''} → ${CHARGE_STATUS_LABELS[after.status ?? ''] ?? after.status ?? ''}`;
    default:
      return '';
  }
}
