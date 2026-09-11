import { describe, expect, it } from 'vitest';
import { daysAlreadyLate, suggestNextDueAt } from './next-due-preview';

const TZ = 'America/Sao_Paulo';
const NOW = new Date('2026-09-11T15:00:00Z'); // 12:00 de 11/09 em São Paulo

const VENCE_10_08 = new Date('2026-08-11T02:59:59.999Z'); // 10/08 23:59:59 local

/**
 * A sugestão que preenche o campo do diálogo. Segue a regra do operador
 * (11/09/2026): âncora na data mais tarde entre o vencimento em aberto e o
 * pagamento.
 */
describe('suggestNextDueAt', () => {
  it('pagou adiantado: mantém o dia do vencimento (vence 10, pagou 05 → 10/09)', () => {
    expect(suggestNextDueAt({ paidAt: '2026-08-05', currentDueAt: VENCE_10_08, cycle: 'MONTHLY', timezone: TZ })).toBe('2026-09-10');
  });

  it('pagou atrasado: conta do pagamento (vence 10, pagou 12 → 12/09)', () => {
    expect(suggestNextDueAt({ paidAt: '2026-08-12', currentDueAt: VENCE_10_08, cycle: 'MONTHLY', timezone: TZ })).toBe('2026-09-12');
  });

  it('respeita o ciclo da assinatura, não assume mensal', () => {
    expect(suggestNextDueAt({ paidAt: '2026-08-05', currentDueAt: VENCE_10_08, cycle: 'QUARTERLY', timezone: TZ })).toBe('2026-11-10');
  });

  it('clamp de fim de mês: vencia 31/01, pagou 31/01, mensal → 28/02', () => {
    const vence31 = new Date('2026-02-01T02:59:59.999Z');
    expect(suggestNextDueAt({ paidAt: '2026-01-31', currentDueAt: vence31, cycle: 'MONTHLY', timezone: TZ })).toBe('2026-02-28');
  });

  it('data incompleta ou inexistente no calendário não vira sugestão errada', () => {
    expect(suggestNextDueAt({ paidAt: '2026-09', currentDueAt: VENCE_10_08, cycle: 'MONTHLY', timezone: TZ })).toBeNull();
    expect(suggestNextDueAt({ paidAt: '2026-02-31', currentDueAt: VENCE_10_08, cycle: 'MONTHLY', timezone: TZ })).toBeNull();
  });
});

/**
 * O relato de 11/09/2026: "renovei ele e está dando que está em atraso · 1d".
 * Registrar hoje um pagamento feito semanas atrás abre um ciclo que já nasce
 * vencido — o aviso existe para ele ver isso antes de confirmar.
 */
describe('daysAlreadyLate', () => {
  it('conta os dias quando o vencimento escolhido já passou', () => {
    expect(daysAlreadyLate({ nextDueAt: '2026-09-10', timezone: TZ, now: NOW })).toBe(1);
  });

  it('hoje e futuro não são atraso', () => {
    expect(daysAlreadyLate({ nextDueAt: '2026-09-11', timezone: TZ, now: NOW })).toBe(0);
    expect(daysAlreadyLate({ nextDueAt: '2026-10-11', timezone: TZ, now: NOW })).toBe(0);
  });

  it('campo vazio ou meio digitado não vira aviso', () => {
    expect(daysAlreadyLate({ nextDueAt: '', timezone: TZ, now: NOW })).toBeNull();
    expect(daysAlreadyLate({ nextDueAt: '2026-02-31', timezone: TZ, now: NOW })).toBeNull();
  });
});
