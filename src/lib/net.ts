/**
 * Extrai o IP confiável de `X-Forwarded-For` para uso no rate limit de login.
 *
 * O header cru é totalmente controlável pelo cliente (`X-Forwarded-For: 1.2.3.4`
 * chega intacto se ninguém reescrever) — usar a primeira entrada (ou o header
 * bruto) deixa o atacante forjar um IP novo a cada tentativa e nunca bater o
 * rate limit.
 *
 * Este projeto faz deploy em Cloud Run **direto**, sem load balancer externo
 * documentado na frente (ver `docs/projeto/tecnico/01-arquitetura.md`). Nesse
 * modelo há exatamente **um** hop confiável — a própria borda do Cloud Run —
 * que ACRESCENTA a IP real observada ao final de qualquer XFF que o cliente
 * mandou, em vez de substituir. A entrada confiável é portanto a **última**
 * da chain, nunca a primeira nem qualquer padding que o atacante adicione à
 * esquerda.
 *
 * ⚠️ Se um load balancer externo (Google Cloud Load Balancing, Cloudflare
 * etc.) for adicionado na frente no futuro, esse parser PRECISA mudar junto
 * — a plataforma passaria a acrescentar um segundo hop, e a entrada
 * confiável deixaria de ser a última.
 *
 * Em dev local, sem nenhum proxy na frente, a chain tem uma entrada só (ou
 * nenhuma) — usa essa entrada ou cai para 'unknown'.
 */
export function getClientIp(forwardedFor: string | null): string {
  if (!forwardedFor) return 'unknown';

  const ips = forwardedFor
    .split(',')
    .map((ip) => ip.trim())
    .filter(Boolean);

  if (ips.length === 0) return 'unknown';

  return ips[ips.length - 1];
}
