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

/** Teto de dígitos do campo de dinheiro. 15 dígitos são R$ 9.999.999.999.999,99 —
 *  folgado para qualquer valor deste domínio e curto o bastante para o campo não
 *  virar um número que ninguém consegue ler. */
export const CURRENCY_MAX_DIGITS = 15;

/** Converte o conteúdo digitado no campo de dinheiro em centavos.
 *
 *  O campo é um **acumulador de centavos**: o operador digita os dígitos que vê,
 *  da direita para a esquerda, e tudo que não é dígito (o `R$`, o ponto de milhar,
 *  a vírgula) é ruído de formatação. Não existe separador decimal para interpretar,
 *  então não existe cursor para perder — foi o que quebrou a versão anterior do
 *  campo, mascarada e controlada, que descartava dígito silenciosamente.
 *
 *  Sem sinal: nenhum campo de dinheiro do painel aceita valor negativo. */
export function digitsToCents(typed: string): string {
  const digits = typed.replace(/\D/g, '').replace(/^0+/, '').slice(0, CURRENCY_MAX_DIGITS);
  return digits === '' ? '0' : digits;
}

/** Empurra um dígito pela direita no acumulador do campo de dinheiro.
 *
 *  ⚠️ Existe porque ler os dígitos da string exibida **depende de onde está o
 *  cursor**. Com o cursor no início de `R$ 0,00`, digitar `7` produzia
 *  `R$ 70,00`: o `0,00` que já estava na tela entrava como escala. O campo é
 *  uma maquininha, não um campo de texto — o estado é o número, e a tecla é
 *  um evento sobre ele, nunca uma edição de string.
 *
 *  Tecla que não é dígito não mexe no valor. */
export function appendDigit(cents: string, key: string): string {
  if (!/^\d$/.test(key)) return cents;

  const current = cents === '0' ? '' : cents;
  if (current.length >= CURRENCY_MAX_DIGITS) return cents;

  const next = `${current}${key}`.replace(/^0+/, '');
  return next === '' ? '0' : next;
}

/** Contraparte de `appendDigit` para o backspace. Campo zerado continua zerado. */
export function dropLastDigit(cents: string): string {
  const next = cents.slice(0, -1);
  return next === '' ? '0' : next;
}
