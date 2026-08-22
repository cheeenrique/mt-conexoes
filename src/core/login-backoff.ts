/** Tentativas de login livres, sem atraso — mesmo teto usado no rate limit por IP. */
export const LOGIN_FREE_ATTEMPTS = 5;

const BASE_BACKOFF_MS = 30_000; // 30s na primeira tentativa depois do limite livre
const MAX_BACKOFF_MS = 15 * 60 * 1000; // teto de 15min, mesma janela do rate limit

/**
 * Atraso exigido antes da próxima tentativa, dado o total de tentativas
 * falhas acumuladas por IP (ou por e-mail) desde o último login bem-sucedido.
 *
 * Sem isso, um bloqueio binário por janela devolve as tentativas de graça
 * assim que a janela expira — o atacante só precisa esperar. Aqui o atraso
 * dobra a cada tentativa além do limite livre, com teto, então esperar não
 * "reseta" nada: só um login bem-sucedido zera a contagem.
 */
export function loginBackoffMs(attemptCount: number): number {
  if (attemptCount < LOGIN_FREE_ATTEMPTS) return 0;
  const exponent = attemptCount - LOGIN_FREE_ATTEMPTS;
  return Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** exponent);
}

/** Tempo restante, em ms, até a próxima tentativa ser permitida. Nunca negativo. */
export function loginRemainingWaitMs(attemptCount: number, lastAttemptAt: Date, now: Date): number {
  const backoff = loginBackoffMs(attemptCount);
  const elapsed = now.getTime() - lastAttemptAt.getTime();
  return Math.max(0, backoff - elapsed);
}
