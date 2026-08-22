import { describe, expect, it } from 'vitest';
import { LOGIN_FREE_ATTEMPTS, loginBackoffMs, loginRemainingWaitMs } from './login-backoff';

describe('loginBackoffMs', () => {
  it('não exige espera abaixo do limite de tentativas livres', () => {
    expect(loginBackoffMs(LOGIN_FREE_ATTEMPTS - 1)).toBe(0);
    expect(loginBackoffMs(0)).toBe(0);
  });

  it('exige espera a partir da tentativa que estoura o limite livre', () => {
    expect(loginBackoffMs(LOGIN_FREE_ATTEMPTS)).toBeGreaterThan(0);
  });

  it('cresce exponencialmente conforme mais tentativas se acumulam', () => {
    const atThreshold = loginBackoffMs(LOGIN_FREE_ATTEMPTS);
    const oneMore = loginBackoffMs(LOGIN_FREE_ATTEMPTS + 1);
    const twoMore = loginBackoffMs(LOGIN_FREE_ATTEMPTS + 2);
    expect(oneMore).toBeGreaterThan(atThreshold);
    expect(twoMore).toBeGreaterThan(oneMore);
    expect(oneMore).toBe(atThreshold * 2);
  });

  it('tem teto — não cresce pra sempre', () => {
    const veryHigh = loginBackoffMs(LOGIN_FREE_ATTEMPTS + 50);
    const evenHigher = loginBackoffMs(LOGIN_FREE_ATTEMPTS + 51);
    expect(veryHigh).toBe(evenHigher);
  });
});

describe('loginRemainingWaitMs', () => {
  it('zero quando o backoff já expirou desde a última tentativa', () => {
    const lastAttemptAt = new Date('2026-08-22T10:00:00Z');
    const now = new Date('2026-08-22T10:30:00Z'); // 30min depois, backoff é bem menor
    expect(loginRemainingWaitMs(LOGIN_FREE_ATTEMPTS, lastAttemptAt, now)).toBe(0);
  });

  it('positivo quando a última tentativa foi recente demais', () => {
    const lastAttemptAt = new Date('2026-08-22T10:00:00Z');
    const now = new Date('2026-08-22T10:00:01Z'); // 1s depois
    expect(loginRemainingWaitMs(LOGIN_FREE_ATTEMPTS, lastAttemptAt, now)).toBeGreaterThan(0);
  });

  it('nunca é negativo', () => {
    const lastAttemptAt = new Date('2026-08-22T10:00:00Z');
    const now = new Date('2026-09-22T10:00:00Z'); // um mês depois
    expect(loginRemainingWaitMs(LOGIN_FREE_ATTEMPTS, lastAttemptAt, now)).toBe(0);
  });

  it('zero abaixo do limite de tentativas livres, mesmo com última tentativa agora mesmo', () => {
    const lastAttemptAt = new Date('2026-08-22T10:00:00Z');
    expect(loginRemainingWaitMs(LOGIN_FREE_ATTEMPTS - 1, lastAttemptAt, lastAttemptAt)).toBe(0);
  });
});
