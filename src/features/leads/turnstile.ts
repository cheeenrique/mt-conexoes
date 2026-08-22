import { logger } from '@/lib/logger';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const TIMEOUT_MS = 5000;

/** `undefined` quando o Turnstile não está configurado neste ambiente. */
function secret(): string | undefined {
  return process.env.TURNSTILE_SECRET_KEY || undefined;
}

export function isTurnstileConfigured(): boolean {
  return secret() !== undefined;
}

/**
 * Valida o token do Cloudflare Turnstile no servidor — exigência de
 * `docs/projeto/tecnico/02-modelo-de-dados.md` para a única tabela escrita
 * por endpoint público.
 *
 * Três decisões que valem comentário:
 *
 * 1. Sem `TURNSTILE_SECRET_KEY` configurada, passa direto. O site é um
 *    deploy separado (repositório, domínio e conta próprios) e pode ainda
 *    não estar mandando token; exigir o token antes disso derruba a captação
 *    inteira. O rate limit por IP continua valendo nesse cenário.
 * 2. Token ausente ou recusado com chave configurada → recusa. É o caminho
 *    que o bot percorre.
 * 3. Cloudflare fora do ar (timeout, DNS, 5xx) → passa, com log. Recusar
 *    aqui transformaria uma indisponibilidade de terceiro em perda de lead,
 *    e o rate limit por IP segue de pé como contenção.
 */
export async function verifyTurnstile(token: string | undefined, remoteIp: string): Promise<boolean> {
  const key = secret();
  if (!key) return true;
  if (!token) return false;

  const body = new URLSearchParams({ secret: key, response: token });
  if (remoteIp !== 'unknown') body.set('remoteip', remoteIp);

  try {
    const res = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      logger.warn({ route: 'leads.capture', turnstile: 'unavailable', status: res.status });
      return true;
    }
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch (err) {
    logger.warn({ route: 'leads.capture', turnstile: 'unreachable', error: String(err) });
    return true;
  }
}
