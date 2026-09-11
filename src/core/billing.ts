import Decimal from 'decimal.js';
import { applyPercent } from './money';

export type DerivedChargeStatus = 'OPEN' | 'OVERDUE' | 'PARTIALLY_PAID' | 'PAID';

/**
 * Deriva o status de uma cobrança a partir do saldo e do vencimento. Nunca
 * devolve CANCELLED — cancelamento é ação explícita (features/charges/service.ts),
 * não derivada aqui. `now` entra por parâmetro, nunca `new Date()` interno.
 */
export function deriveChargeStatus(params: {
  netCents: bigint;
  paidCents: bigint;
  dueAt: Date;
  now: Date;
}): DerivedChargeStatus {
  if (params.paidCents >= params.netCents) return 'PAID';
  if (params.now > params.dueAt) return 'OVERDUE';
  if (params.paidCents > 0n) return 'PARTIALLY_PAID';
  return 'OPEN';
}

/**
 * Desconto vigente na emissão de uma cobrança, em centavos. `discountUntil`
 * precisa cobrir o início do período — desconto vencido não entra na cobrança
 * nova.
 *
 * Vive em `core/` porque é cálculo financeiro puro: estava em
 * `features/subscriptions/service.ts` e passou a ter um segundo chamador em
 * `features/charges`, que não pode importar de outra feature. Regra de dinheiro
 * duplicada entre dois caminhos é divergência de valor garantida.
 */
export function computeChargeDiscount(
  subscription: { priceCents: bigint; discountType: string | null; discountValue: unknown; discountUntil: Date | null },
  periodStart: Date,
): bigint {
  if (!subscription.discountType || !subscription.discountValue) return 0n;
  if (subscription.discountUntil && subscription.discountUntil < periodStart) return 0n;

  const value = new Decimal(subscription.discountValue.toString());
  if (subscription.discountType === 'PERCENT') {
    return applyPercent(subscription.priceCents, value);
  }
  // FIXED: discountValue está em reais (Decimal(10,2)), converte pra centavos.
  return BigInt(value.times(100).toFixed(0));
}
