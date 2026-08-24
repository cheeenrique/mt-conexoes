// @vitest-environment node
//
// Testes de caracterização do guarda de autenticação (migrado de middleware.ts
// para a convenção `proxy` do Next 16 — mesma assinatura, mesmo comportamento).
// Não cobrem `config.matcher` — matcher é configuração de build, lida pelo Next
// antes de invocar a função; `proxy(req)` nunca o exercita. O matcher (exceção
// de assets da tela de login) é conferido manualmente contra o servidor rodando.
import { beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';

// Precisa vir antes do import de `./proxy` / `@/lib/auth`: getSecret() lê
// process.env a cada chamada (não no load do módulo), mas fixar aqui deixa
// explícito que o secret de teste é responsabilidade deste arquivo.
process.env.SESSION_SECRET = 'test-secret-at-least-32-bytes-long-ok';

const { proxy } = await import('./proxy');
const { COOKIE_NAME, signSession } = await import('@/lib/auth');

function request(pathname: string, cookieValue?: string): NextRequest {
  const headers = cookieValue ? { cookie: `${COOKIE_NAME}=${cookieValue}` } : undefined;
  return new NextRequest(new URL(pathname, 'http://localhost:3000'), { headers });
}

function passedThrough(res: Response): boolean {
  return res.headers.get('x-middleware-next') === '1';
}

function redirectsToLogin(res: Response): boolean {
  if (res.status !== 307) return false;
  const location = res.headers.get('location');
  return location !== null && new URL(location).pathname === '/login';
}

describe('proxy', () => {
  let validToken: string;

  beforeAll(async () => {
    validToken = await signSession({ userId: 'user-1', sessionVersion: 0 });
  });

  describe('caminhos públicos passam sem cookie', () => {
    it.each(['/login', '/api/health', '/api/leads'])('%s', async (path) => {
      const res = await proxy(request(path));
      expect(passedThrough(res)).toBe(true);
    });

    it('/api/leads/algum-subcaminho (filho de caminho público) passa sem cookie', async () => {
      const res = await proxy(request('/api/leads/qualquer'));
      expect(passedThrough(res)).toBe(true);
    });
  });

  describe('prefixos públicos passam sem cookie', () => {
    it.each(['/api/cron/charges-generate', '/api/webhooks/meta-cloud'])('%s', async (path) => {
      const res = await proxy(request(path));
      expect(passedThrough(res)).toBe(true);
    });
  });

  describe('matchesPath não casa prefixo parcial — só caminho exato ou filho', () => {
    // `/api/leadsfoo` começa com a string "/api/leads", mas não é `/api/leads`
    // nem filho dele (`/api/leads/...`). Tratar como público liberaria uma rota
    // que não existe hoje, mas que passaria a vazar sem cookie se alguém criar
    // `/api/leadsfoo` no futuro achando que já está protegida pelo padrão.
    it.each(['/api/leadsfoo', '/api/cronjob', '/api/webhooksomething'])(
      '%s não é tratado como público — exige sessão',
      async (path) => {
        const res = await proxy(request(path));
        expect(redirectsToLogin(res)).toBe(true);
      },
    );
  });

  describe('rota do painel', () => {
    it('sem cookie redireciona para /login', async () => {
      const res = await proxy(request('/'));
      expect(redirectsToLogin(res)).toBe(true);
    });

    it('com cookie inválido redireciona para /login', async () => {
      const res = await proxy(request('/', 'token-invalido'));
      expect(redirectsToLogin(res)).toBe(true);
    });

    it('com cookie válido segue', async () => {
      const res = await proxy(request('/', validToken));
      expect(passedThrough(res)).toBe(true);
    });
  });
});
