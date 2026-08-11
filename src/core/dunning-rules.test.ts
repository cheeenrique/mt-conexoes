import { describe, expect, it } from 'vitest';
import { daysFromDue, consolidate, type PendingStep } from './dunning-rules';

const TZ = 'America/Sao_Paulo';

describe('daysFromDue', () => {
  it('negativo quando ainda falta pro vencimento (D-5)', () => {
    const due = new Date('2026-08-15T23:59:59-03:00');
    const now = new Date('2026-08-10T12:00:00-03:00');
    expect(daysFromDue(due, now, TZ)).toBe(-5);
  });

  it('zero no dia do vencimento', () => {
    const due = new Date('2026-08-10T23:59:59-03:00');
    const now = new Date('2026-08-10T08:00:00-03:00');
    expect(daysFromDue(due, now, TZ)).toBe(0);
  });

  it('positivo quando já passou (D+3)', () => {
    const due = new Date('2026-08-05T23:59:59-03:00');
    const now = new Date('2026-08-08T12:00:00-03:00');
    expect(daysFromDue(due, now, TZ)).toBe(3);
  });

  it('vira o dia local mesmo perto da virada UTC', () => {
    // 2026-08-10 23:30 em America/Sao_Paulo (UTC-3) = 2026-08-11 02:30Z
    const due = new Date('2026-08-10T23:59:59-03:00');
    const now = new Date('2026-08-11T02:30:00Z');
    expect(daysFromDue(due, now, TZ)).toBe(0);
  });
});

const CONTEXT = {
  'cliente.primeiro_nome': 'João', 'cliente.nome': 'João Silva',
  'cobranca.valor': 'R$ 60,00', 'cobranca.vencimento': '10/08',
  'cobranca.dias_atraso': '3', 'pix.chave': 'chave-x', 'negocio.nome': 'MT',
} as const;

describe('consolidate', () => {
  it('1 cliente com 1 cobrança gera 1 mensagem sem sufixo', () => {
    const pending: PendingStep[] = [
      { customerId: 'c1', toPhone: '+5511999990000', chargeId: 'ch1', stepId: 's1', offsetDays: 1, templateBody: 'Olá {{cliente.primeiro_nome}}, {{cobranca.valor}}', netCents: '6000', context: CONTEXT },
    ];
    const result = consolidate(pending, 'America/Sao_Paulo');
    expect(result).toHaveLength(1);
    expect(result[0].customerId).toBe('c1');
    expect(result[0].toPhone).toBe('+5511999990000');
    expect(result[0].body).toBe('Olá João, R$ 60,00');
    expect(result[0].chargeIds).toEqual(['ch1']);
  });

  it('1 cliente com 3 cobranças gera 1 mensagem só, com sufixo de total', () => {
    const pending: PendingStep[] = [
      { customerId: 'c1', toPhone: '+5511999990000', chargeId: 'ch1', stepId: 's1', offsetDays: 1, templateBody: 'Olá {{cliente.primeiro_nome}}, {{cobranca.valor}}', netCents: '6000', context: CONTEXT },
      { customerId: 'c1', toPhone: '+5511999990000', chargeId: 'ch2', stepId: 's2', offsetDays: 3, templateBody: 'ÚLTIMO AVISO {{cliente.primeiro_nome}}, {{cobranca.valor}} atrasada', netCents: '5000', context: { ...CONTEXT, 'cobranca.valor': 'R$ 50,00' } },
      { customerId: 'c1', toPhone: '+5511999990000', chargeId: 'ch3', stepId: 's3', offsetDays: 1, templateBody: 'Olá {{cliente.primeiro_nome}}, {{cobranca.valor}}', netCents: '4000', context: { ...CONTEXT, 'cobranca.valor': 'R$ 40,00' } },
    ];
    const result = consolidate(pending, 'America/Sao_Paulo');
    expect(result).toHaveLength(1);
    // usa o template do passo de maior offsetDays (mais atrasado) como base
    expect(result[0].body).toContain('ÚLTIMO AVISO João, R$ 50,00 atrasada');
    expect(result[0].body).toContain('mais 2 cobrança(s)');
    expect(result[0].chargeIds.sort()).toEqual(['ch1', 'ch2', 'ch3']);
    expect(result[0].stepIds.sort()).toEqual(['s1', 's2', 's3']);
  });

  it('2 clientes diferentes geram 2 mensagens', () => {
    const pending: PendingStep[] = [
      { customerId: 'c1', toPhone: '+5511999990000', chargeId: 'ch1', stepId: 's1', offsetDays: 1, templateBody: 'Olá {{cliente.primeiro_nome}}', netCents: '6000', context: CONTEXT },
      { customerId: 'c2', toPhone: '+5511999990001', chargeId: 'ch2', stepId: 's1', offsetDays: 1, templateBody: 'Olá {{cliente.primeiro_nome}}', netCents: '6000', context: CONTEXT },
    ];
    const result = consolidate(pending, 'America/Sao_Paulo');
    expect(result).toHaveLength(2);
  });
});
