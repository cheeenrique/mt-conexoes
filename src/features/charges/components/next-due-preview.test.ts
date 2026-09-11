import { describe, expect, it } from 'vitest';
import { nextDuePreview } from './next-due-preview';

const TZ = 'America/Sao_Paulo';
const NOW = new Date('2026-09-11T15:00:00Z'); // 12:00 de 11/09 em São Paulo

/**
 * O relato do operador em 11/09/2026: "renovei ele e está dando que está em
 * atraso · 1d". Ele registrou hoje um pagamento feito em 10/08; o ciclo mensal
 * a partir dali venceu 10/09 — ontem. A regra está certa (CLAUDE.md §Data e
 * fuso), o que faltava era ele ver isso antes de confirmar.
 */
describe('nextDuePreview', () => {
  it('avisa quando o próximo ciclo já nasce vencido — o caso que virou relato de bug', () => {
    const preview = nextDuePreview({ paidAt: '2026-08-10', cycle: 'MONTHLY', timezone: TZ, now: NOW });

    expect(preview?.dueAt.toISOString()).toBe('2026-09-11T02:59:59.999Z'); // 10/09 23:59:59 local
    expect(preview?.daysLate).toBe(1);
  });

  it('pagamento de hoje abre o ciclo no futuro, sem aviso', () => {
    const preview = nextDuePreview({ paidAt: '2026-09-11', cycle: 'MONTHLY', timezone: TZ, now: NOW });

    expect(preview?.daysLate).toBe(0);
  });

  it('respeita o ciclo da assinatura, não assume mensal', () => {
    const preview = nextDuePreview({ paidAt: '2026-09-11', cycle: 'QUARTERLY', timezone: TZ, now: NOW });

    expect(preview?.dueAt.toISOString()).toBe('2026-12-12T02:59:59.999Z'); // 11/12 local
  });

  it('clamp de fim de mês: pagou 31/01, mensal, vence 28/02', () => {
    const preview = nextDuePreview({ paidAt: '2026-01-31', cycle: 'MONTHLY', timezone: TZ, now: NOW });

    expect(preview?.dueAt.toISOString()).toBe('2026-03-01T02:59:59.999Z'); // 28/02 23:59:59 local
  });

  it('data incompleta ou inexistente no calendário não vira prévia errada', () => {
    expect(nextDuePreview({ paidAt: '2026-09', cycle: 'MONTHLY', timezone: TZ, now: NOW })).toBeNull();
    expect(nextDuePreview({ paidAt: '2026-02-31', cycle: 'MONTHLY', timezone: TZ, now: NOW })).toBeNull();
  });
});
