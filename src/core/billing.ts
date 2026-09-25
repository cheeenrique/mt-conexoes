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
 * Assinatura de cortesia: acesso concedido sem cobrar. Na base real são as contas
 * do próprio operador ("Eu", "Meu Quarto") e os acessos que ele dá de graça.
 *
 * Preço zero **é** a marcação — não existe campo separado, de propósito. Dois
 * campos que podem discordar (`isCourtesy: true` com `priceCents: 3000`) criam um
 * estado que alguém cria sem querer e ninguém sabe ler depois. `price-audit.ts` já
 * tratava preço zero como cortesia antes desta função existir; isto só dá nome à
 * regra e um lugar só para ela morar.
 *
 * ⚠️ Cortesia não é isenção de um ciclo. "Este mês não cobro" é `discountType` /
 * `discountValue` na assinatura, que mantém a cobrança existindo com valor zerado.
 * Cortesia é a ausência permanente de cobrança: sem `Charge`, a assinatura não
 * aparece em /charges, não entra na régua e não vira mensagem.
 */
export function isCourtesySubscription(subscription: { priceCents: bigint }): boolean {
  return subscription.priceCents <= 0n;
}

/**
 * A cobrança carrega um valor que o plano de hoje não tem mais — troca de plano
 * ou reajuste depois da emissão. `principalCents` é congelado na emissão e nada
 * o reescreve sozinho (CLAUDE.md §Dinheiro); esta função só diz que ficou para
 * trás, e quem decide se o valor novo vale para esta cobrança é o operador.
 *
 * Um lugar só porque três pontos perguntam a mesma coisa: a tela que oferece a
 * escolha, o service que a aplica e a troca de plano na ficha. Tela e service
 * divergindo é oferecer um realinhamento que o service ignora.
 */
export function hasOldPlanAmount(params: { chargePrincipalCents: bigint; planPriceCents: bigint }): boolean {
  return params.chargePrincipalCents !== params.planPriceCents;
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
