// @vitest-environment node
import { describe, expect, it } from 'vitest';

describe('session JWT', () => {
  it('assina e verifica ida e volta', async () => {
    process.env.SESSION_SECRET = 'test-secret-at-least-32-bytes-long-ok';
    const { signSession, verifySession } = await import('./auth');
    const token = await signSession({ userId: 'user-1', sessionVersion: 0 });
    const payload = await verifySession(token);
    expect(payload).toEqual({ userId: 'user-1', sessionVersion: 0 });
  });

  it('devolve null para token inválido', async () => {
    process.env.SESSION_SECRET = 'test-secret-at-least-32-bytes-long-ok';
    const { verifySession } = await import('./auth');
    expect(await verifySession('token-invalido')).toBeNull();
  });

  it('estoura alto — não devolve null — quando SESSION_SECRET está mal configurado', async () => {
    // Um secret curto demais é erro de configuração, não "sessão inválida".
    // Se isso vazasse como null, um SESSION_SECRET quebrado em produção
    // apareceria como "todo mundo foi deslogado", sem pista da causa real.
    process.env.SESSION_SECRET = 'curto-demais';
    const { verifySession } = await import('./auth');
    await expect(verifySession('qualquer-token')).rejects.toThrow(/SESSION_SECRET/);
  });
});
