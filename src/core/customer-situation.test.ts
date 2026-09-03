import { describe, expect, it } from 'vitest';
import { isCustomerSituationFilter, resolveCustomerSituation } from './customer-situation';

const TZ = 'America/Sao_Paulo';

/** 23:59:59.999 de `day` em São Paulo (UTC-3) é 02:59:59.999 UTC do dia seguinte. */
function dueAtLocalEndOfDay(iso: string): Date {
  return new Date(`${iso}T23:59:59.999-03:00`);
}

describe('resolveCustomerSituation', () => {
  it('removido (soft delete) ganha de tudo, menos de anonimizado', () => {
    expect(
      resolveCustomerSituation({
        subscriptionStatus: 'ACTIVE',
        openChargeDueAt: dueAtLocalEndOfDay('2026-08-22'),
        now: new Date('2026-08-22T12:00:00Z'),
        timezone: TZ,
        deletedAt: new Date('2026-08-20T12:00:00Z'),
      }),
    ).toBe('DELETED');
  });

  it('anonimizado ganha até de removido', () => {
    expect(
      resolveCustomerSituation({
        subscriptionStatus: null,
        openChargeDueAt: null,
        now: new Date('2026-08-22T12:00:00Z'),
        timezone: TZ,
        anonymizedAt: new Date('2026-08-19T12:00:00Z'),
        deletedAt: new Date('2026-08-20T12:00:00Z'),
      }),
    ).toBe('ANONYMIZED');
  });

  it('anonimizado ganha de tudo — mesmo com assinatura ativa e cobrança vencendo hoje', () => {
    expect(
      resolveCustomerSituation({
        subscriptionStatus: 'ACTIVE',
        openChargeDueAt: dueAtLocalEndOfDay('2026-08-22'),
        now: new Date('2026-08-22T12:00:00Z'),
        timezone: TZ,
        anonymizedAt: new Date('2026-08-20T12:00:00Z'),
      }),
    ).toBe('ANONYMIZED');
  });

  it('cliente sem assinatura nenhuma não é "Ativo"', () => {
    expect(
      resolveCustomerSituation({
        subscriptionStatus: null,
        openChargeDueAt: null,
        now: new Date('2026-08-22T12:00:00Z'),
        timezone: TZ,
      }),
    ).toBe('NO_SUBSCRIPTION');
  });

  it('assinatura cancelada não é "Ativo"', () => {
    expect(
      resolveCustomerSituation({
        subscriptionStatus: 'CANCELLED',
        openChargeDueAt: dueAtLocalEndOfDay('2026-08-01'),
        now: new Date('2026-08-22T12:00:00Z'),
        timezone: TZ,
      }),
    ).toBe('NO_SUBSCRIPTION');
  });

  it('suspenso ganha da cobrança em atraso — o cliente continua na lista', () => {
    expect(
      resolveCustomerSituation({
        subscriptionStatus: 'SUSPENDED',
        openChargeDueAt: dueAtLocalEndOfDay('2026-08-01'),
        now: new Date('2026-08-22T12:00:00Z'),
        timezone: TZ,
      }),
    ).toBe('SUSPENDED');
  });

  it('ativa sem cobrança em aberto é "Ativo"', () => {
    expect(
      resolveCustomerSituation({
        subscriptionStatus: 'ACTIVE',
        openChargeDueAt: null,
        now: new Date('2026-08-22T12:00:00Z'),
        timezone: TZ,
      }),
    ).toBe('ACTIVE');
  });

  it('cobrança vencendo hoje é "Vence hoje"', () => {
    expect(
      resolveCustomerSituation({
        subscriptionStatus: 'ACTIVE',
        openChargeDueAt: dueAtLocalEndOfDay('2026-08-22'),
        now: new Date('2026-08-22T12:00:00Z'),
        timezone: TZ,
      }),
    ).toBe('DUE_TODAY');
  });

  it('cobrança de ontem é "Em atraso"', () => {
    expect(
      resolveCustomerSituation({
        subscriptionStatus: 'ACTIVE',
        openChargeDueAt: dueAtLocalEndOfDay('2026-08-21'),
        now: new Date('2026-08-22T12:00:00Z'),
        timezone: TZ,
      }),
    ).toBe('OVERDUE');
  });

  it('cobrança futura é "Em aberto"', () => {
    expect(
      resolveCustomerSituation({
        subscriptionStatus: 'ACTIVE',
        openChargeDueAt: dueAtLocalEndOfDay('2026-08-30'),
        now: new Date('2026-08-22T12:00:00Z'),
        timezone: TZ,
      }),
    ).toBe('OPEN');
  });

  // O bug que a derivação em UTC produziria: 23:00 local de 21/08 já é 22/08 em
  // UTC. Quem comparar sem fuso marca "Em atraso" três horas antes da hora.
  it('às 23h de 21/08 no fuso do negócio a cobrança de 21/08 ainda vence hoje', () => {
    expect(
      resolveCustomerSituation({
        subscriptionStatus: 'ACTIVE',
        openChargeDueAt: dueAtLocalEndOfDay('2026-08-21'),
        now: new Date('2026-08-22T02:00:00Z'), // 23:00 de 21/08 em São Paulo
        timezone: TZ,
      }),
    ).toBe('DUE_TODAY');
  });

  it('à 01h de 22/08 no fuso do negócio a cobrança de 21/08 já está em atraso', () => {
    expect(
      resolveCustomerSituation({
        subscriptionStatus: 'ACTIVE',
        openChargeDueAt: dueAtLocalEndOfDay('2026-08-21'),
        now: new Date('2026-08-22T04:00:00Z'), // 01:00 de 22/08 em São Paulo
        timezone: TZ,
      }),
    ).toBe('OVERDUE');
  });

  it('vira o mês sem tropeçar: 31/07 visto em 01/08 é atraso', () => {
    expect(
      resolveCustomerSituation({
        subscriptionStatus: 'ACTIVE',
        openChargeDueAt: dueAtLocalEndOfDay('2026-07-31'),
        now: new Date('2026-08-01T15:00:00Z'),
        timezone: TZ,
      }),
    ).toBe('OVERDUE');
  });
});

describe('isCustomerSituationFilter', () => {
  it('aceita as cinco situações que viram chip', () => {
    expect(isCustomerSituationFilter('ACTIVE')).toBe(true);
    expect(isCustomerSituationFilter('DUE_TODAY')).toBe(true);
    expect(isCustomerSituationFilter('OVERDUE')).toBe(true);
    expect(isCustomerSituationFilter('ANONYMIZED')).toBe(true);
    expect(isCustomerSituationFilter('DELETED')).toBe(true);
  });

  it('recusa situação derivada que não tem chip, e lixo vindo da URL', () => {
    expect(isCustomerSituationFilter('SUSPENDED')).toBe(false);
    expect(isCustomerSituationFilter('OPEN')).toBe(false);
    expect(isCustomerSituationFilter('; DROP TABLE customers')).toBe(false);
  });
});
