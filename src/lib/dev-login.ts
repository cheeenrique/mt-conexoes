/**
 * Login automático de desenvolvimento — existe só para que um agente ou um
 * teste de ponta a ponta consiga navegar o painel sem digitar senha.
 *
 * ⚠️ **Duas travas, ambas obrigatórias**, checadas a cada requisição e nunca em
 * tempo de import (env avaliada no boot esconderia a trava de quem lê o
 * handler):
 *
 * 1. `NODE_ENV !== 'production'` — o Dockerfile fixa `NODE_ENV=production` no
 *    estágio de runtime, então a rota é 404 em qualquer imagem publicada, mesmo
 *    que alguém exporte a variável abaixo por engano no Cloud Run.
 * 2. `DEV_AUTO_LOGIN === '1'` — opt-in explícito por máquina, em `.env.local`,
 *    que não é versionado.
 *
 * Desligada, a rota responde 404 (não 403): quem sonda não descobre que ela
 * existe. E ela **não** contorna o guard de sessão — emite um cookie de sessão
 * de verdade, assinado com `SESSION_SECRET`, para que tudo o que rodar depois
 * passe por `requireSession()` igual a um operador logado. Não há `if` de
 * ambiente dentro de `lib/auth.ts` nem do proxy por causa disto.
 */
export function isDevAutoLoginEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.DEV_AUTO_LOGIN === '1';
}
