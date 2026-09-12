import { describe, expect, it } from 'vitest';
import { findPriceSuspicions, type SubscriptionPriceRow } from './price-audit';

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
