import { describe, expect, it } from 'vitest';
import {
  LEAD_MAX_ATTEMPTS_PER_WINDOW,
  LEAD_WINDOW_MINUTES,
  evaluateLeadRateLimit,
  leadWindowStart,
} from './lead-rate-limit';

const NOW = new Date('2026-08-22T12:00:00.000Z');

describe('leadWindowStart', () => {
  it('abre a janela LEAD_WINDOW_MINUTES antes de agora', () => {
    expect(leadWindowStart(NOW)).toEqual(new Date('2026-08-22T11:00:00.000Z'));
    expect(LEAD_WINDOW_MINUTES).toBe(60);
  });
});

describe('evaluateLeadRateLimit', () => {
  it('deixa passar o primeiro envio do IP', () => {
    const result = evaluateLeadRateLimit({ attemptsInWindow: 0, oldestAttemptAt: null, now: NOW });
    expect(result).toEqual({ allowed: true, retryAfterSeconds: 0 });
  });

  it('deixa passar enquanto faltar uma tentativa para o teto', () => {
    const result = evaluateLeadRateLimit({
      attemptsInWindow: LEAD_MAX_ATTEMPTS_PER_WINDOW - 1,
      oldestAttemptAt: new Date('2026-08-22T11:30:00.000Z'),
      now: NOW,
    });
    expect(result.allowed).toBe(true);
  });

  it('bloqueia ao bater o teto da janela', () => {
    const result = evaluateLeadRateLimit({
      attemptsInWindow: LEAD_MAX_ATTEMPTS_PER_WINDOW,
      oldestAttemptAt: new Date('2026-08-22T11:30:00.000Z'),
      now: NOW,
    });
    expect(result.allowed).toBe(false);
  });

  // Janela deslizante: o bloqueio termina quando a tentativa mais antiga sai
  // da janela, não num horário redondo. Sem isso o atacante espera o "reset"
  // do balde e manda tudo de novo de graça.
  it('devolve o tempo até a tentativa mais antiga sair da janela', () => {
    const result = evaluateLeadRateLimit({
      attemptsInWindow: LEAD_MAX_ATTEMPTS_PER_WINDOW,
      oldestAttemptAt: new Date('2026-08-22T11:30:00.000Z'),
      now: NOW,
    });
    expect(result.retryAfterSeconds).toBe(30 * 60);
  });

  it('arredonda o tempo restante para cima, nunca para zero', () => {
    const result = evaluateLeadRateLimit({
      attemptsInWindow: LEAD_MAX_ATTEMPTS_PER_WINDOW,
      oldestAttemptAt: new Date('2026-08-22T11:00:00.500Z'),
      now: NOW,
    });
    expect(result.retryAfterSeconds).toBe(1);
  });

  // Chamador conta as tentativas e lê a mais antiga em duas queries: entre
  // uma e outra a linha pode sair da janela. Sem esse piso a resposta vira
  // `Retry-After: 0`, que o cliente lê como "manda de novo agora".
  it('mantém um piso de 1 segundo quando a tentativa mais antiga já saiu da janela', () => {
    const result = evaluateLeadRateLimit({
      attemptsInWindow: LEAD_MAX_ATTEMPTS_PER_WINDOW,
      oldestAttemptAt: new Date('2026-08-22T10:00:00.000Z'),
      now: NOW,
    });
    expect(result).toEqual({ allowed: false, retryAfterSeconds: 1 });
  });

  it('cai para a janela inteira quando não há tentativa mais antiga conhecida', () => {
    const result = evaluateLeadRateLimit({
      attemptsInWindow: LEAD_MAX_ATTEMPTS_PER_WINDOW,
      oldestAttemptAt: null,
      now: NOW,
    });
    expect(result.retryAfterSeconds).toBe(LEAD_WINDOW_MINUTES * 60);
  });
});
