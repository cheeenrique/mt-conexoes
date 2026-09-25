import { describe, expect, it } from 'vitest';
import { deriveChargeStatus, hasOldPlanAmount, isCourtesySubscription } from './billing';

const DUE = new Date('2026-08-10T23:59:59.999Z'); // 23:59:59 local já em UTC

describe('deriveChargeStatus', () => {
  it('sem pagamento e antes do vencimento é OPEN', () => {
    const status = deriveChargeStatus({ netCents: 10_000n, paidCents: 0n, dueAt: DUE, now: new Date('2026-08-05T12:00:00Z') });
    expect(status).toBe('OPEN');
  });

  it('sem pagamento e depois do vencimento é OVERDUE', () => {
    const status = deriveChargeStatus({ netCents: 10_000n, paidCents: 0n, dueAt: DUE, now: new Date('2026-08-11T00:00:01Z') });
    expect(status).toBe('OVERDUE');
  });

  it('pagamento parcial antes do vencimento é PARTIALLY_PAID', () => {
    const status = deriveChargeStatus({ netCents: 10_000n, paidCents: 4_000n, dueAt: DUE, now: new Date('2026-08-05T12:00:00Z') });
    expect(status).toBe('PARTIALLY_PAID');
  });

  it('pagamento parcial depois do vencimento é OVERDUE, não PARTIALLY_PAID', () => {
    const status = deriveChargeStatus({ netCents: 10_000n, paidCents: 4_000n, dueAt: DUE, now: new Date('2026-08-11T00:00:01Z') });
    expect(status).toBe('OVERDUE');
  });

  it('pagamento igual ao net é PAID, mesmo depois do vencimento', () => {
    const status = deriveChargeStatus({ netCents: 10_000n, paidCents: 10_000n, dueAt: DUE, now: new Date('2026-09-01T00:00:00Z') });
    expect(status).toBe('PAID');
  });

  it('pagamento acima do net (não deveria acontecer, mas não quebra) ainda é PAID', () => {
    const status = deriveChargeStatus({ netCents: 10_000n, paidCents: 10_500n, dueAt: DUE, now: new Date('2026-08-05T12:00:00Z') });
    expect(status).toBe('PAID');
  });

  it('cobrança de 0 centavos com 0 pago é PAID, não OPEN (nada a cobrar)', () => {
    const status = deriveChargeStatus({ netCents: 0n, paidCents: 0n, dueAt: DUE, now: new Date('2026-08-05T12:00:00Z') });
    expect(status).toBe('PAID');
  });

  it('vencimento exatamente igual a now ainda não é OVERDUE (dueAt é inclusive)', () => {
    const status = deriveChargeStatus({ netCents: 10_000n, paidCents: 0n, dueAt: DUE, now: DUE });
    expect(status).toBe('OPEN');
  });
});

describe('isCourtesySubscription', () => {
  it('preço zero é cortesia', () => {
    expect(isCourtesySubscription({ priceCents: 0n })).toBe(true);
  });

  it('um centavo já não é cortesia — cobrar R$ 0,01 é cobrar', () => {
    expect(isCourtesySubscription({ priceCents: 1n })).toBe(false);
  });

  it('preço normal não é cortesia', () => {
    expect(isCourtesySubscription({ priceCents: 3_000n })).toBe(false);
  });

  // Não existe preço negativo no schema (`CHECK price_cents >= 0`), mas a função é
  // pura e não deve inventar um terceiro estado se uma linha estragada aparecer:
  // "não é para cobrar" é a resposta segura.
  it('preço negativo cai no lado da cortesia, não em cobrança', () => {
    expect(isCourtesySubscription({ priceCents: -1n })).toBe(true);
  });
});

/**
 * O cliente mensal de R$ 35,00 que virou trimestral de R$ 75,00 (25/09/2026): a
 * cobrança em aberto seguiu com R$ 35,00 e o diálogo de pagamento recusava os
 * R$ 75,00 que ele pagou. A tela pergunta qual valor vale e o service aplica —
 * os dois lados decidem "ficou para trás" por esta função, senão a tela oferece
 * a troca e o service a ignora.
 */
describe('hasOldPlanAmount', () => {
  it('cobrança com valor diferente do plano de hoje ficou para trás', () => {
    expect(hasOldPlanAmount({ chargePrincipalCents: 3_500n, planPriceCents: 7_500n })).toBe(true);
  });

  it('cobrança com o valor do plano não ficou para trás', () => {
    expect(hasOldPlanAmount({ chargePrincipalCents: 7_500n, planPriceCents: 7_500n })).toBe(false);
  });

  it('um centavo de diferença já é valor de outro plano', () => {
    expect(hasOldPlanAmount({ chargePrincipalCents: 7_499n, planPriceCents: 7_500n })).toBe(true);
  });

  // Plano mais barato também conta: o trimestral de R$ 90,00 que virou mensal
  // de R$ 35,00 (11/09/2026) é o caso que criou o realinhamento.
  it('plano novo mais barato também deixa a cobrança para trás', () => {
    expect(hasOldPlanAmount({ chargePrincipalCents: 9_000n, planPriceCents: 3_500n })).toBe(true);
  });
});
