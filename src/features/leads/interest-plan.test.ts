import { describe, expect, it } from 'vitest';
import { resolveInterestPlanId } from './interest-plan';

const PLANS = [
  { id: 'p-anual', name: 'Anual Premium', cycle: 'ANNUAL' },
  { id: 'p-mensal', name: 'Mensal', cycle: 'MONTHLY' },
  { id: 'p-tri', name: 'Combo 3 meses', cycle: 'QUARTERLY' },
];

describe('resolveInterestPlanId', () => {
  it('casa o interesse pelo nome do plano, ignorando caixa e acento', () => {
    expect(resolveInterestPlanId(PLANS, 'anual premium')).toBe('p-anual');
  });

  it('casa pelo rótulo do ciclo quando nenhum plano tem esse nome', () => {
    // O formulário do site oferece "Trimestral"; o plano se chama outra coisa.
    expect(resolveInterestPlanId(PLANS, 'Trimestral')).toBe('p-tri');
  });

  it('cai em Mensal quando o interesse é "Ainda não sei"', () => {
    expect(resolveInterestPlanId(PLANS, 'Ainda não sei')).toBe('p-mensal');
  });

  it('cai em Mensal quando o lead não marcou interesse', () => {
    expect(resolveInterestPlanId(PLANS, null)).toBe('p-mensal');
    expect(resolveInterestPlanId(PLANS, '')).toBe('p-mensal');
  });

  it('cai em Mensal quando o interesse não bate com nada', () => {
    expect(resolveInterestPlanId(PLANS, 'quero um combo com futebol')).toBe('p-mensal');
  });

  it('usa o primeiro plano quando não existe nenhum mensal', () => {
    const semMensal = PLANS.filter((plan) => plan.cycle !== 'MONTHLY');
    expect(resolveInterestPlanId(semMensal, 'Ainda não sei')).toBe('p-anual');
  });

  // Base sem plano cadastrado: a conversão continua possível, e o operador
  // escolhe na mão. Devolver o id de um plano que não existe seria pior.
  it('devolve vazio quando não há plano cadastrado', () => {
    expect(resolveInterestPlanId([], 'Mensal')).toBe('');
  });
});
