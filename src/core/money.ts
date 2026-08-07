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
