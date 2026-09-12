import { describe, expect, it } from 'vitest';
import {
  findPlanMismatches,
  findPriceSuspicions,
  findStaleCharges,
  type OpenChargeRow,
  type PlanMismatchRow,
  type SubscriptionPriceRow,
} from './price-audit';

function row(overrides: Partial<SubscriptionPriceRow> = {}): SubscriptionPriceRow {
  return {
    id: 'sub-1',
    customerName: 'Cliente',
    priceCents: 3000n,
    costCents: 1000n,
    paymentsCents: [3000n, 3000n, 3000n],
    ...overrides,
  };
}

/**
 * Os dois casos relatados em 11/09/2026: R$ 30,00/mês cadastrados em
 * R$ 1.830,00 e R$ 750,00.
 */
describe('findPriceSuspicions', () => {
  it('pega o cliente que paga R$ 30 com assinatura de R$ 1.830', () => {
    const [found] = findPriceSuspicions([row({ priceCents: 183000n, paymentsCents: [3000n, 3000n] })]);

    expect(found.reason).toBe('paga_muito_menos');
    expect(found.typicalPaymentCents).toBe(3000n);
    expect(found.ratio).toBe(61);
  });

  it('pega o de R$ 750 pela mesma razão', () => {
    const [found] = findPriceSuspicions([row({ priceCents: 75000n, paymentsCents: [3000n] })]);

    expect(found.ratio).toBe(25);
  });

  it('quem paga o que está cadastrado não aparece', () => {
    expect(findPriceSuspicions([row()])).toEqual([]);
  });

  it('pagamento parcial legítimo não vira suspeita — parcelar não é erro de cadastro', () => {
    expect(findPriceSuspicions([row({ priceCents: 3000n, paymentsCents: [1600n] })])).toEqual([]); // metade
    expect(findPriceSuspicions([row({ priceCents: 3000n, paymentsCents: [1000n] })])).toEqual([]); // um terço
  });

  it('usa a mediana: um pagamento avulso não mascara o padrão', () => {
    const found = findPriceSuspicions([row({ priceCents: 183000n, paymentsCents: [3000n, 3000n, 180000n] })]);

    expect(found[0].typicalPaymentCents).toBe(3000n);
  });

  it('sem pagamento nenhum, cai na margem implausível', () => {
    const [found] = findPriceSuspicions([row({ priceCents: 183000n, costCents: 1000n, paymentsCents: [] })]);

    expect(found.reason).toBe('margem_implausivel');
  });

  it('sem pagamento e com margem normal não acusa nada', () => {
    expect(findPriceSuspicions([row({ priceCents: 3000n, costCents: 1000n, paymentsCents: [] })])).toEqual([]);
  });

  it('assinatura de graça não é suspeita de preço', () => {
    expect(findPriceSuspicions([row({ priceCents: 0n, paymentsCents: [] })])).toEqual([]);
  });
});

function openCharge(overrides: Partial<OpenChargeRow> = {}): OpenChargeRow {
  return {
    chargeId: 'charge-1',
    customerName: 'Cliente',
    principalCents: 3000n,
    subscriptionPriceCents: 3000n,
    paidCents: 0n,
    ...overrides,
  };
}

/**
 * O caso do Walderi (11/09/2026): assinatura em R$ 30,00 com a cobrança em
 * aberto ainda em R$ 1.830,00, porque `principalCents` é congelado na emissão e
 * a troca de plano não o toca.
 */
describe('findStaleCharges', () => {
  it('pega a cobrança que ficou 61x acima do preço da assinatura', () => {
    const [found] = findStaleCharges([openCharge({ principalCents: 183000n, paidCents: 3000n })]);

    expect(found.ratio).toBe(61);
    expect(found.hasPayment).toBe(true);
  });

  it('cobrança no mesmo valor da assinatura não é suspeita', () => {
    expect(findStaleCharges([openCharge()])).toEqual([]);
  });

  it('reajuste não vira suspeita — cobrança de R$ 30 com assinatura em R$ 35 fica quieta', () => {
    expect(findStaleCharges([openCharge({ principalCents: 3000n, subscriptionPriceCents: 3500n })])).toEqual([]);
  });

  it('cobrança menor que o preço de hoje nunca é corrigida — seria cobrar a mais por conta própria', () => {
    expect(findStaleCharges([openCharge({ principalCents: 3000n, subscriptionPriceCents: 90000n })])).toEqual([]);
  });

  it('sem pagamento, marca que dá para realinhar direto', () => {
    const [found] = findStaleCharges([openCharge({ principalCents: 75000n, paidCents: 0n })]);

    expect(found.hasPayment).toBe(false);
  });

  it('assinatura sem preço não serve de referência', () => {
    expect(findStaleCharges([openCharge({ principalCents: 183000n, subscriptionPriceCents: 0n })])).toEqual([]);
  });
});


function planRow(overrides: Partial<PlanMismatchRow> = {}): PlanMismatchRow {
  return { customerName: 'Cliente', priceCents: 3000n, planName: 'Mensal', planPriceCents: 3000n, ...overrides };
}

/**
 * Conferido contra a base real em 12/09/2026: dos 6 que a primeira versão
 * acusava, 4 eram contas do próprio operador a R$ 0,00 ("Eu", "Meu Quarto") e 2
 * eram preço negociado **acima** do plano. Nenhum era erro.
 */
describe('findPlanMismatches', () => {
  it('pega a assinatura que ficou muito abaixo do plano — mensal apontando para anual', () => {
    const found = findPlanMismatches([planRow({ priceCents: 3000n, planName: 'Anual', planPriceCents: 36000n })]);
    expect(found).toHaveLength(1);
  });

  it('cortesia não é divergência — é a conta do próprio operador', () => {
    expect(findPlanMismatches([planRow({ priceCents: 0n, planPriceCents: 36000n })])).toEqual([]);
  });

  it('preço acima do plano é negociação, não erro', () => {
    expect(findPlanMismatches([planRow({ priceCents: 5500n, planPriceCents: 4000n })])).toEqual([]);
  });

  it('diferença pequena para baixo também não acusa', () => {
    expect(findPlanMismatches([planRow({ priceCents: 3000n, planPriceCents: 3500n })])).toEqual([]);
  });
});
