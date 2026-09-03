import { describe, expect, it } from 'vitest';
import { assertAnonymizable } from './anonymization';

describe('assertAnonymizable', () => {
  it('sem assinatura ativa e sem cobrança em aberto libera', () => {
    const check = assertAnonymizable({ activeSubscriptionCount: 0, openChargeCount: 0 });
    expect(check).toEqual({ ok: true });
  });

  it('assinatura ativa sozinha bloqueia e nomeia o que impede', () => {
    const check = assertAnonymizable({ activeSubscriptionCount: 1, openChargeCount: 0 });
    expect(check).toEqual({ ok: false, reason: 'Este cliente tem 1 assinatura ativa. Cancele antes de anonimizar.' });
  });

  it('cobrança em aberto sozinha bloqueia e nomeia o que impede', () => {
    const check = assertAnonymizable({ activeSubscriptionCount: 0, openChargeCount: 1 });
    expect(check).toEqual({ ok: false, reason: 'Este cliente tem 1 cobrança em aberto. Cancele antes de anonimizar.' });
  });

  it('os dois juntos nomeiam os dois, no plural certo', () => {
    const check = assertAnonymizable({ activeSubscriptionCount: 1, openChargeCount: 2 });
    expect(check).toEqual({
      ok: false,
      reason: 'Este cliente tem 1 assinatura ativa e 2 cobranças em aberto. Cancele antes de anonimizar.',
    });
  });

  it('duas assinaturas ativas no plural certo', () => {
    const check = assertAnonymizable({ activeSubscriptionCount: 2, openChargeCount: 0 });
    expect(check).toEqual({ ok: false, reason: 'Este cliente tem 2 assinaturas ativas. Cancele antes de anonimizar.' });
  });
});
