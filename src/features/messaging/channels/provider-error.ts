import { logger } from '@/lib/logger';

/**
 * Traduz uma falha de comunicação com o provider no motivo que o operador lê.
 *
 * ⚠️ A mensagem do erro técnico **nunca** é o motivo devolvido. `err.message` de
 * um `fetch` que não sai do lugar é `"fetch failed"` — inglês, jargão de rede,
 * sem dizer o que fazer — e chegou a aparecer como toast na tela de Canais. O
 * detalhe técnico continua existindo, no log estruturado, que é onde se
 * investiga; a tela recebe uma frase em pt-BR.
 *
 * Não carrega credencial: `String(err)` de um erro de rede traz host e código,
 * não o corpo da requisição. Quem redige o que sobra é `redactSecrets`, no
 * service, antes de a frase chegar na tela.
 */
export function providerFailureReason(
  context: { provider: string; op: string },
  err: unknown,
  reason: string,
): string {
  logger.error({ provider: context.provider, op: context.op, error: String(err) });
  return reason;
}
