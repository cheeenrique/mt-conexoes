import { describe, expect, it } from 'vitest';
import { daysFromDue, consolidate, selectStepsForCharge, type PendingStep } from './dunning-rules';

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
      { customerId: 'c1', toPhone: '+5511999990000', chargeId: 'ch1', stepId: 's1', offsetDays: 1, templateBody: 'Olá {{cliente.primeiro_nome}}, {{cobranca.valor}}', netCents: '6000', context: CONTEXT, metaTemplateName: null, metaTemplateParams: null },
    ];
    const result = consolidate(pending);
    expect(result).toHaveLength(1);
    expect(result[0].customerId).toBe('c1');
    expect(result[0].toPhone).toBe('+5511999990000');
    expect(result[0].body).toBe('Olá João, R$ 60,00');
    expect(result[0].extraCount).toBe(0);
    expect(result[0].chargeIds).toEqual(['ch1']);
    expect(result[0].templateName).toBeNull();
    expect(result[0].templateParams).toBeNull();
  });

  it('1 cliente com 3 cobranças gera 1 mensagem só, com sufixo de total', () => {
    const pending: PendingStep[] = [
      { customerId: 'c1', toPhone: '+5511999990000', chargeId: 'ch1', stepId: 's1', offsetDays: 1, templateBody: 'Olá {{cliente.primeiro_nome}}, {{cobranca.valor}}', netCents: '6000', context: CONTEXT, metaTemplateName: null, metaTemplateParams: null },
      { customerId: 'c1', toPhone: '+5511999990000', chargeId: 'ch2', stepId: 's2', offsetDays: 3, templateBody: 'ÚLTIMO AVISO {{cliente.primeiro_nome}}, {{cobranca.valor}} atrasada', netCents: '5000', context: { ...CONTEXT, 'cobranca.valor': 'R$ 50,00' }, metaTemplateName: null, metaTemplateParams: null },
      { customerId: 'c1', toPhone: '+5511999990000', chargeId: 'ch3', stepId: 's3', offsetDays: 1, templateBody: 'Olá {{cliente.primeiro_nome}}, {{cobranca.valor}}', netCents: '4000', context: { ...CONTEXT, 'cobranca.valor': 'R$ 40,00' }, metaTemplateName: null, metaTemplateParams: null },
    ];
    const result = consolidate(pending);
    expect(result).toHaveLength(1);
    // usa o template do passo de maior offsetDays (mais atrasado) como base, sem sufixo — caller formata
    expect(result[0].body).toBe('ÚLTIMO AVISO João, R$ 50,00 atrasada');
    expect(result[0].extraCount).toBe(2);
    expect(result[0].extraCents).toBe('10000'); // ch1 (6000) + ch3 (4000)
    expect(result[0].chargeIds.sort()).toEqual(['ch1', 'ch2', 'ch3']);
    expect(result[0].stepIds.sort()).toEqual(['s1', 's2', 's3']);
  });

  it('2 clientes diferentes geram 2 mensagens', () => {
    const pending: PendingStep[] = [
      { customerId: 'c1', toPhone: '+5511999990000', chargeId: 'ch1', stepId: 's1', offsetDays: 1, templateBody: 'Olá {{cliente.primeiro_nome}}', netCents: '6000', context: CONTEXT, metaTemplateName: null, metaTemplateParams: null },
      { customerId: 'c2', toPhone: '+5511999990001', chargeId: 'ch2', stepId: 's1', offsetDays: 1, templateBody: 'Olá {{cliente.primeiro_nome}}', netCents: '6000', context: CONTEXT, metaTemplateName: null, metaTemplateParams: null },
    ];
    const result = consolidate(pending);
    expect(result).toHaveLength(2);
  });

  it('passo único carrega o template Meta do passo base pro resultado', () => {
    const pending: PendingStep[] = [
      {
        customerId: 'c1', toPhone: '+5511999990000', chargeId: 'ch1', stepId: 's1', offsetDays: 0,
        templateBody: 'Olá {{cliente.primeiro_nome}}, {{cobranca.valor}}', netCents: '6000', context: CONTEXT,
        metaTemplateName: 'renovacao_hoje', metaTemplateParams: { '1': 'João', '2': 'R$ 60,00' },
      },
    ];
    const result = consolidate(pending);
    expect(result[0].templateName).toBe('renovacao_hoje');
    expect(result[0].templateParams).toEqual({ '1': 'João', '2': 'R$ 60,00' });
  });

  it('consolidação (extraCount > 0) ainda carrega o template do passo base — quem decide se pode sair é o chamador, não `consolidate`', () => {
    const pending: PendingStep[] = [
      {
        customerId: 'c1', toPhone: '+5511999990000', chargeId: 'ch1', stepId: 's1', offsetDays: 3,
        templateBody: 'ÚLTIMO AVISO {{cliente.primeiro_nome}}', netCents: '5000', context: CONTEXT,
        metaTemplateName: 'ultimo_aviso', metaTemplateParams: { '1': 'João' },
      },
      {
        customerId: 'c1', toPhone: '+5511999990000', chargeId: 'ch2', stepId: 's2', offsetDays: 1,
        templateBody: 'Olá {{cliente.primeiro_nome}}', netCents: '4000', context: CONTEXT,
        metaTemplateName: 'renovacao_lembrete', metaTemplateParams: { '1': 'João' },
      },
    ];
    const result = consolidate(pending);
    expect(result).toHaveLength(1);
    expect(result[0].extraCount).toBe(1);
    // base = maior offsetDays (3, "ultimo_aviso") — o template do passo extra some, igual o corpo dele já somia antes.
    expect(result[0].templateName).toBe('ultimo_aviso');
  });
});

describe('selectStepsForCharge', () => {
  // A escada real da base: avisa 5 e 2 dias antes, no dia, +1, +3, e suspende no +5.
  const STEPS = [
    { offsetDays: -5, action: 'SEND_MESSAGE' },
    { offsetDays: -2, action: 'SEND_MESSAGE' },
    { offsetDays: 0, action: 'SEND_MESSAGE' },
    { offsetDays: 1, action: 'SEND_MESSAGE' },
    { offsetDays: 3, action: 'SEND_MESSAGE' },
    { offsetDays: 5, action: 'SUSPEND' },
  ];

  const offsets = (days: number) => selectStepsForCharge(days, STEPS).map((s) => s.offsetDays);

  it('degrau comum casa só no dia exato', () => {
    expect(offsets(-5)).toEqual([-5]);
    expect(offsets(-2)).toEqual([-2]);
    expect(offsets(0)).toEqual([0]);
    expect(offsets(1)).toEqual([1]);
  });

  it('dia que não é degrau nenhum não casa nada', () => {
    expect(offsets(-4)).toEqual([]);
    expect(offsets(-1)).toEqual([]);
    expect(offsets(2)).toEqual([]);
  });

  // O ponto do exercício: a cobrança que passou por baixo da escada enquanto o envio
  // estava pausado. Antes disto, `daysFromDue === offsetDays` deixava 8 cobranças
  // vencidas sem nenhuma mensagem, para sempre.
  it('último degrau de mensagem pega quem já passou dele', () => {
    expect(offsets(3)).toEqual([3]);
    expect(offsets(4)).toEqual([3]);
    expect(offsets(6)).toEqual([3]);
    expect(offsets(30)).toEqual([3]);
  });

  it('no dia 5 pega o último degrau de mensagem E o SUSPEND', () => {
    expect(offsets(5)).toEqual([3, 5]);
  });

  // ⚠️ SUSPEND continua casando por dia exato de propósito: "a partir de" ali
  // suspenderia de uma vez toda a base atrasada que passou do dia 5.
  it('SUSPEND nunca é o degrau de recuperação, mesmo sendo o de maior offset', () => {
    expect(offsets(6)).not.toContain(5);
    expect(offsets(30)).not.toContain(5);
  });

  it('régua com um único degrau de mensagem: ele é o de recuperação', () => {
    const single = [{ offsetDays: 0, action: 'SEND_MESSAGE' }];
    expect(selectStepsForCharge(9, single).map((s) => s.offsetDays)).toEqual([0]);
    expect(selectStepsForCharge(-1, single)).toEqual([]);
  });

  it('régua só com SUSPEND não ganha degrau de recuperação', () => {
    const onlySuspend = [{ offsetDays: 5, action: 'SUSPEND' }];
    expect(selectStepsForCharge(9, onlySuspend)).toEqual([]);
    expect(selectStepsForCharge(5, onlySuspend).map((s) => s.offsetDays)).toEqual([5]);
  });

  it('régua sem degrau nenhum não explode', () => {
    expect(selectStepsForCharge(3, [])).toEqual([]);
  });
});
