import { afterEach, describe, expect, it } from 'vitest';
import { isDevAutoLoginEnabled } from './dev-login';

// `process.env.NODE_ENV` é readonly no tipo do Node 22+; o objeto em si não é.
const env = process.env as Record<string, string | undefined>;
const original = { NODE_ENV: env.NODE_ENV, DEV_AUTO_LOGIN: env.DEV_AUTO_LOGIN };

afterEach(() => {
  env.NODE_ENV = original.NODE_ENV;
  if (original.DEV_AUTO_LOGIN === undefined) delete env.DEV_AUTO_LOGIN;
  else env.DEV_AUTO_LOGIN = original.DEV_AUTO_LOGIN;
});

/**
 * A rota emite sessão sem senha. As duas travas são a única coisa entre ela e
 * um painel aberto — cada uma sozinha tem que bastar para desligar.
 */
describe('isDevAutoLoginEnabled', () => {
  it('liga só com as duas travas: fora de produção E opt-in explícito', () => {
    env.NODE_ENV = 'development';
    env.DEV_AUTO_LOGIN = '1';
    expect(isDevAutoLoginEnabled()).toBe(true);
  });

  it('produção desliga, mesmo com a variável ligada', () => {
    env.NODE_ENV = 'production';
    env.DEV_AUTO_LOGIN = '1';
    expect(isDevAutoLoginEnabled()).toBe(false);
  });

  it('sem a variável fica desligada, mesmo em desenvolvimento', () => {
    env.NODE_ENV = 'development';
    delete env.DEV_AUTO_LOGIN;
    expect(isDevAutoLoginEnabled()).toBe(false);
  });

  it('valor diferente de "1" não liga — nada de "true"/"yes" por engano', () => {
    env.NODE_ENV = 'development';
    env.DEV_AUTO_LOGIN = 'true';
    expect(isDevAutoLoginEnabled()).toBe(false);
  });
});
