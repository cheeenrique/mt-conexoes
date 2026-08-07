/**
 * Extrai o IP confiável de `X-Forwarded-For` para uso no rate limit de login.
 *
 * O header cru é totalmente controlável pelo cliente (`X-Forwarded-For: 1.2.3.4`
 * chega intacto se ninguém reescrever). No Cloud Run atrás do load balancer do
 * Google, a infraestrutura sempre ACRESCENTA hops ao final da chain em vez de
 * substituir — a entrada mais à direita é o hop interno do próprio Cloud Run,
 * e a penúltima é a IP do cliente observada pelo load balancer, essa sim
 * confiável. Usar a primeira entrada (ou o header cru) permite ao atacante
 * forjar um IP novo a cada tentativa e nunca bater o rate limit.
 *
 * Em dev local, sem load balancer na frente, a chain tem uma entrada só (ou
 * nenhuma) — usa essa entrada ou cai para 'unknown'.
 */
export function getClientIp(forwardedFor: string | null): string {
  if (!forwardedFor) return 'unknown';

  const ips = forwardedFor
    .split(',')
    .map((ip) => ip.trim())
    .filter(Boolean);

  if (ips.length === 0) return 'unknown';
  if (ips.length === 1) return ips[0];

  return ips[ips.length - 2];
}
