import Decimal from 'decimal.js';

/** Divisão com arredondamento half up. Numerador e denominador não-negativos. */
export function divRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  return remainder * 2n >= denominator ? quotient + 1n : quotient;
}

/** Aplica um percentual sobre um valor em centavos. */
export function applyPercent(cents: bigint, percent: Decimal): bigint {
  const basisPoints = BigInt(percent.times(100).toFixed(0));
  return divRoundHalfUp(cents * basisPoints, 10_000n);
}

/** Margem em pontos percentuais, para exibição. Retorna null se não há receita. */
export function marginPercent(revenueCents: bigint, costCents: bigint): Decimal | null {
  if (revenueCents === 0n) return null;
  return new Decimal((revenueCents - costCents).toString())
    .div(revenueCents.toString())
    .times(100);
}

/** Novo preço mantendo o markup absoluto quando o custo muda — nunca abaixo de zero. */
export function resolveAdjustedPriceCents(oldPriceCents: bigint, oldCostCents: bigint, newCostCents: bigint): bigint {
  const delta = newCostCents - oldCostCents;
  const newPriceCents = oldPriceCents + delta;
  return newPriceCents < 0n ? 0n : newPriceCents;
}

export type MarginStatus = 'negative' | 'below_threshold' | 'ok';

/** revenueCents ≤ costCents é sempre 'negative', mesmo quando marginPercent devolveria null
 *  (receita zero). alertPercent vem de Settings.marginAlertPercent, nunca hardcoded. */
export function classifySubscriptionMargin(
  revenueCents: bigint,
  costCents: bigint,
  alertPercent: Decimal,
): MarginStatus {
  if (revenueCents - costCents <= 0n) return 'negative';
  const margin = marginPercent(revenueCents, costCents)!; // revenueCents > 0 aqui — nunca null
  return margin.lessThan(alertPercent) ? 'below_threshold' : 'ok';
}
