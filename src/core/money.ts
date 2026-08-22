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

export type MarginTone = 'healthy' | 'tight' | 'critical';

const MARGIN_TONE_HEALTHY_FLOOR = new Decimal(40);
const MARGIN_TONE_TIGHT_FLOOR = new Decimal(15);

/** Régua fixa de cor de margem usada em toda tela que lista fornecedor, plano
 *  ou assinatura (40% saudável, 15–39% apertada, abaixo crítica). Não confundir
 *  com `classifySubscriptionMargin`: aquela decide alerta com o limite
 *  configurável de `Settings.marginAlertPercent`; esta é fixa, só decoração. */
export function classifyMarginTone(margin: Decimal | null): MarginTone | null {
  if (margin === null) return null;
  if (margin.greaterThanOrEqualTo(MARGIN_TONE_HEALTHY_FLOOR)) return 'healthy';
  if (margin.greaterThanOrEqualTo(MARGIN_TONE_TIGHT_FLOOR)) return 'tight';
  return 'critical';
}

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

/** Converte um valor decimal digitado para centavos. Espera ponto como separador
 *  decimal — é o formato que o `unmaskedValue` do imask sempre devolve, mesmo com
 *  `radix: ','` configurado na máscara (ver `CurrencyInput`). Arredonda round half
 *  up, uma vez, no fim, se aparecer mais de 2 casas fracionárias. */
export function parseDecimalStringToCents(decimal: string): string {
  const trimmed = decimal.trim();
  if (trimmed === '') return '0';

  const negative = trimmed.startsWith('-');
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [integerPart, fractionalPart = ''] = unsigned.split('.');

  const integerDigits = integerPart.replace(/\D/g, '') || '0';
  const fractionalDigits = fractionalPart.replace(/\D/g, '');

  const fractionalCents =
    fractionalDigits.length <= 2
      ? BigInt(fractionalDigits.padEnd(2, '0') || '00')
      : divRoundHalfUp(BigInt(fractionalDigits), 10n ** BigInt(fractionalDigits.length - 2));

  const cents = BigInt(integerDigits) * 100n + fractionalCents;
  return negative && cents !== 0n ? String(-cents) : String(cents);
}
