/**
 * Política de rate limit do endpoint público de captação. Função pura — o
 * chamador conta as linhas de `lead_attempts` e passa `now`.
 *
 * ⚠️ O desenho é deliberadamente diferente do rate limit de login
 * (`core/login-backoff.ts`). Lá o backoff cresce e só um login bem-sucedido
 * zera a contagem, porque tentativa repetida é sinal de ataque. Aqui o
 * sucesso é o caso normal: quem preenche o formulário é um visitante. Um
 * backoff que endurece a cada envio bem-sucedido transformaria o IP
 * compartilhado de uma operadora móvel num bloqueio permanente — e o lead
 * perdido não volta.
 *
 * Então: janela deslizante simples, teto folgado para gente, apertado para
 * script. Acima do teto o site cai para o WhatsApp (ver 08-site.md), que é a
 * degradação desejada.
 */

/** Envios por IP tolerados na janela. Pessoa real manda uma vez; script manda mil. */
export const LEAD_MAX_ATTEMPTS_PER_WINDOW = 10;

export const LEAD_WINDOW_MINUTES = 60;

const WINDOW_MS = LEAD_WINDOW_MINUTES * 60 * 1000;

/** Início da janela deslizante — tudo antes disso não conta mais. */
export function leadWindowStart(now: Date): Date {
  return new Date(now.getTime() - WINDOW_MS);
}

export interface LeadRateLimitDecision {
  allowed: boolean;
  /** Sempre ≥ 1 quando bloqueado — `Retry-After: 0` é lido como "manda de novo agora". */
  retryAfterSeconds: number;
}

export function evaluateLeadRateLimit(params: {
  attemptsInWindow: number;
  /** Tentativa mais antiga ainda dentro da janela; `null` quando não há nenhuma. */
  oldestAttemptAt: Date | null;
  now: Date;
}): LeadRateLimitDecision {
  if (params.attemptsInWindow < LEAD_MAX_ATTEMPTS_PER_WINDOW) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (!params.oldestAttemptAt) {
    return { allowed: false, retryAfterSeconds: LEAD_WINDOW_MINUTES * 60 };
  }

  const freesUpAt = params.oldestAttemptAt.getTime() + WINDOW_MS;
  const remainingMs = freesUpAt - params.now.getTime();
  return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1000)) };
}
