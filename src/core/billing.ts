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
