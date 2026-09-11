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

  it('cliente sem assinatura nenhuma não entra na escada de cobrança', () => {
    expect(
      resolveCustomerSituation({
        subscriptionStatus: null,
        openChargeDueAt: null,
        now: new Date('2026-08-22T12:00:00Z'),
        timezone: TZ,
      }),
    ).toBe('NO_SUBSCRIPTION');
  });

  it('assinatura cancelada não entra na escada de cobrança', () => {
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

  // Estado de anomalia, não de saúde: a corrente garante uma cobrança em aberto
  // por assinatura ativa (pagamento emite a próxima na mesma transação), então
  // chegar aqui significa que alguém cancelou a cobrança à mão. Antes chamava-se
  // "Ativo" e vinha em verde — a base importada inteira caía nele e parecia
  // saudável enquanto ninguém a cobrava.
  it('ativa sem cobrança em aberto é "Sem cobrança", não "Em dia"', () => {
    expect(
      resolveCustomerSituation({
        subscriptionStatus: 'ACTIVE',
        openChargeDueAt: null,
        now: new Date('2026-08-22T12:00:00Z'),
        timezone: TZ,
      }),
    ).toBe('NO_CHARGE');
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

  it('cobrança daqui a 8 dias é "Em dia"', () => {
    expect(
      resolveCustomerSituation({
        subscriptionStatus: 'ACTIVE',
        openChargeDueAt: dueAtLocalEndOfDay('2026-08-30'),
        now: new Date('2026-08-22T12:00:00Z'),
        timezone: TZ,
      }),
    ).toBe('UP_TO_DATE');
  });

  // A janela de "vence em breve" é a do balde D-2 da linha de vencimento do
  // Início (DUE_SOON_DAYS): um vocabulário só entre as duas telas.
  it.each([
    ['2026-08-23', 'DUE_SOON'],
    ['2026-08-24', 'DUE_SOON'],
    ['2026-08-25', 'DUE_SOON'],
    ['2026-08-26', 'UP_TO_DATE'],
  ])('vencimento em %s visto em 22/08 é %s', (due, expected) => {
    expect(
      resolveCustomerSituation({
        subscriptionStatus: 'ACTIVE',
        openChargeDueAt: dueAtLocalEndOfDay(due),
        now: new Date('2026-08-22T12:00:00Z'),
        timezone: TZ,
      }),
    ).toBe(expected);
  });

  it('atraso de 40 dias continua "Em atraso" — a granularidade é o contador, não outro estado', () => {
    expect(
      resolveCustomerSituation({
        subscriptionStatus: 'ACTIVE',
        openChargeDueAt: dueAtLocalEndOfDay('2026-07-13'),
        now: new Date('2026-08-22T12:00:00Z'),
        timezone: TZ,
      }),
    ).toBe('OVERDUE');
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
  it('aceita as situações que viram chip', () => {
    for (const value of ['UP_TO_DATE', 'DUE_SOON', 'DUE_TODAY', 'OVERDUE', 'SUSPENDED', 'NO_CHARGE', 'ANONYMIZED', 'DELETED']) {
      expect(isCustomerSituationFilter(value)).toBe(true);
    }
  });

  it('recusa situação derivada que não tem chip, e lixo vindo da URL', () => {
    expect(isCustomerSituationFilter('NO_SUBSCRIPTION')).toBe(false);
    expect(isCustomerSituationFilter('; DROP TABLE customers')).toBe(false);
  });

  // Link antigo do operador (?situacao=ACTIVE) não pode virar erro nem filtro
  // silencioso errado — cai fora e a tela mostra todos.
  it('recusa os nomes antigos, que saíram do modelo', () => {
    expect(isCustomerSituationFilter('ACTIVE')).toBe(false);
    expect(isCustomerSituationFilter('OPEN')).toBe(false);
  });
});
