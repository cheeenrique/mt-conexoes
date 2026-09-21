import { describe, expect, it } from 'vitest';
import { diffSubscriptionForEvents, type SubscriptionSnapshot } from './subscription-events';

const BASE: SubscriptionSnapshot = {
  planId: 'plano-trimestral',
  priceCents: '9000',
  costCents: '3000',
  cycle: 'QUARTERLY',
  nextDueAt: '2026-09-25',
  status: 'ACTIVE',
};

function withChanges(changes: Partial<SubscriptionSnapshot>): SubscriptionSnapshot {
  return { ...BASE, ...changes };
}

describe('diffSubscriptionForEvents', () => {
  it('salvar sem mexer em nada não gera evento', () => {
    expect(diffSubscriptionForEvents(BASE, BASE)).toEqual([]);
  });

  // Um clique do operador é uma linha na ficha. Trocar o plano mexe em quatro
  // colunas de uma vez; quatro eventos transformariam a linha do tempo em log
  // de banco, e o operador para de ler.
  it('troca de plano é UM evento, mesmo mexendo em preço, custo e ciclo juntos', () => {
    const events = diffSubscriptionForEvents(
      BASE,
      withChanges({ planId: 'plano-mensal', priceCents: '3500', costCents: '1000', cycle: 'MONTHLY' }),
    );

    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('SUBSCRIPTION_PLAN_CHANGED');
    expect(events[0].before).toEqual({
      planId: 'plano-trimestral', priceCents: '9000', costCents: '3000', cycle: 'QUARTERLY',
    });
    expect(events[0].after).toEqual({
      planId: 'plano-mensal', priceCents: '3500', costCents: '1000', cycle: 'MONTHLY',
    });
  });

  it('preço e custo editados à mão, sem trocar de plano, viram um evento só', () => {
    const events = diffSubscriptionForEvents(BASE, withChanges({ priceCents: '9500', costCents: '3200' }));

    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('SUBSCRIPTION_PRICE_EDITED');
    expect(events[0].after).toEqual({ priceCents: '9500', costCents: '3200' });
  });

  it('ciclo, vencimento e situação são decisões separadas', () => {
    const events = diffSubscriptionForEvents(
      BASE,
      withChanges({ cycle: 'MONTHLY', nextDueAt: '2026-10-05', status: 'SUSPENDED' }),
    );

    expect(events.map((event) => event.kind)).toEqual([
      'SUBSCRIPTION_CYCLE_CHANGED',
      'SUBSCRIPTION_DUE_DATE_EDITED',
      'SUBSCRIPTION_STATUS_CHANGED',
    ]);
  });

  it('plano removido ("Nenhum") também é troca de plano', () => {
    const events = diffSubscriptionForEvents(BASE, withChanges({ planId: null }));

    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('SUBSCRIPTION_PLAN_CHANGED');
    expect(events[0].after.planId).toBeNull();
  });
});
