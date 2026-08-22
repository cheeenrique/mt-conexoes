import type { ChannelDescriptor } from './types';

const MASK = '•••';
const MAX_LENGTH = 240;

/**
 * Sanitiza texto de erro vindo do provider antes de gravar em `lastError` ou de
 * chegar à tela: um 401 da Meta ou do Evolution pode ecoar o token que foi enviado.
 *
 * CLAUDE.md, §Segurança: credencial de canal não aparece em log, Sentry nem
 * mensagem de erro. Só os campos marcados `secret` no descritor são apagados —
 * URL da instância e id de número não são segredo e ajudam a diagnosticar.
 *
 * Varre os campos de **todos** os caminhos de conexão: o mesmo segredo pode ser
 * digitado num caminho e gerado pelo painel no outro (`webhookToken` da Evolution).
 */
export function redactSecrets(reason: string, credentials: unknown, descriptor: ChannelDescriptor): string {
  const values = credentials && typeof credentials === 'object' ? (credentials as Record<string, unknown>) : {};

  let text = reason;
  for (const field of descriptor.connectionMethods.flatMap((method) => method.credentialFields)) {
    if (!field.secret) continue;
    const value = values[field.name];
    // Valor curto demais vira ruído: apagar "abc" apaga pedaço de palavra comum.
    if (typeof value !== 'string' || value.length < 6) continue;
    text = text.split(value).join(MASK);
  }

  return text.length > MAX_LENGTH ? `${text.slice(0, MAX_LENGTH)}…` : text;
}
