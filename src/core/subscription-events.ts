/**
 * Quais eventos nascem de uma edição de assinatura.
 *
 * **Um evento por decisão do operador, não por coluna alterada.** Trocar o
 * plano mexe em plano, preço, custo e ciclo de uma vez — quatro eventos para
 * um clique transformam a linha do tempo da ficha em log de banco, e o jeito
 * mais rápido de fazer o operador parar de ler o histórico é enchê-lo de
 * ruído. Só vira evento próprio o que ele mexeu sozinho.
 *
 * Puro de propósito (`.claude/rules/01-arquitetura.md`): recebe os dois
 * retratos já achatados em string, não conhece Prisma, e por isso o `kind` é
 * união de string em vez do enum gerado. Um teste de integração garante que
 * toda união daqui existe no enum do banco.
 */
export type SubscriptionEventKind =
  | 'SUBSCRIPTION_PLAN_CHANGED'
  | 'SUBSCRIPTION_PRICE_EDITED'
  | 'SUBSCRIPTION_CYCLE_CHANGED'
  | 'SUBSCRIPTION_DUE_DATE_EDITED'
  | 'SUBSCRIPTION_STATUS_CHANGED';

export interface SubscriptionSnapshot {
  planId: string | null;
  /** Centavos como string — este módulo não calcula, só compara. */
  priceCents: string;
  costCents: string;
  cycle: string;
  /** 'YYYY-MM-DD' no fuso do negócio. */
  nextDueAt: string;
  status: string;
}

export interface SubscriptionEvent {
  kind: SubscriptionEventKind;
  before: Record<string, string | null>;
  after: Record<string, string | null>;
}

export function diffSubscriptionForEvents(
  before: SubscriptionSnapshot,
  after: SubscriptionSnapshot,
): SubscriptionEvent[] {
  const events: SubscriptionEvent[] = [];

  // Plano trocado absorve preço, custo e ciclo: foi tudo o mesmo clique.
  if (before.planId !== after.planId) {
    events.push({
      kind: 'SUBSCRIPTION_PLAN_CHANGED',
      before: { planId: before.planId, priceCents: before.priceCents, costCents: before.costCents, cycle: before.cycle },
      after: { planId: after.planId, priceCents: after.priceCents, costCents: after.costCents, cycle: after.cycle },
    });
  } else {
    if (before.priceCents !== after.priceCents || before.costCents !== after.costCents) {
      events.push({
        kind: 'SUBSCRIPTION_PRICE_EDITED',
        before: { priceCents: before.priceCents, costCents: before.costCents },
        after: { priceCents: after.priceCents, costCents: after.costCents },
      });
    }
    if (before.cycle !== after.cycle) {
      events.push({
        kind: 'SUBSCRIPTION_CYCLE_CHANGED',
        before: { cycle: before.cycle },
        after: { cycle: after.cycle },
      });
    }
  }

  if (before.nextDueAt !== after.nextDueAt) {
    events.push({
      kind: 'SUBSCRIPTION_DUE_DATE_EDITED',
      before: { nextDueAt: before.nextDueAt },
      after: { nextDueAt: after.nextDueAt },
    });
  }

  if (before.status !== after.status) {
    events.push({
      kind: 'SUBSCRIPTION_STATUS_CHANGED',
      before: { status: before.status },
      after: { status: after.status },
    });
  }

  return events;
}
