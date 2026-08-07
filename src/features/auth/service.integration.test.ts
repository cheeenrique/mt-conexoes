import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hash } from '@node-rs/argon2';
import { db } from '@/lib/db';
import { login } from './service';
import { InvalidCredentialsError, TooManyLoginAttemptsError } from '@/lib/errors';

const TEST_EMAIL = 'teste@mtconexoes.com.br';

beforeEach(async () => {
  await db.user.create({
    data: { email: TEST_EMAIL, name: 'Teste', passwordHash: await hash('senha-correta') },
  });
});

afterEach(async () => {
  await db.loginAttempt.deleteMany();
  await db.user.deleteMany({ where: { email: TEST_EMAIL } });
});

describe('login', () => {
  it('devolve token com senha correta', async () => {
    const token = await login({ email: TEST_EMAIL, password: 'senha-correta', ip: '127.0.0.1' });
    expect(typeof token).toBe('string');
  });

  it('rejeita senha errada', async () => {
    await expect(login({ email: TEST_EMAIL, password: 'errada', ip: '127.0.0.2' }))
      .rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it('bloqueia após 5 tentativas erradas na janela de 15 minutos', async () => {
    for (let i = 0; i < 5; i++) {
      await login({ email: TEST_EMAIL, password: 'errada', ip: '127.0.0.3' }).catch(() => {});
    }
    await expect(login({ email: TEST_EMAIL, password: 'senha-correta', ip: '127.0.0.3' }))
      .rejects.toBeInstanceOf(TooManyLoginAttemptsError);
  });
});
