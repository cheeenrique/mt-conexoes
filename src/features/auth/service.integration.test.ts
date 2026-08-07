import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hash } from '@node-rs/argon2';
import { db } from '@/lib/db';
import { changePassword, login } from './service';
import { verifySession } from '@/lib/auth';
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

describe('changePassword', () => {
  it('invalida o token de sessão antigo ao trocar a senha', async () => {
    const user = await db.user.findUniqueOrThrow({ where: { email: TEST_EMAIL } });
    const oldToken = await login({ email: TEST_EMAIL, password: 'senha-correta', ip: '127.0.0.4' });

    await changePassword(user.id, { currentPassword: 'senha-correta', newPassword: 'nova-senha-123' });

    const oldPayload = await verifySession(oldToken);
    const updatedUser = await db.user.findUniqueOrThrow({ where: { id: user.id } });

    expect(oldPayload).not.toBeNull();
    expect(oldPayload?.sessionVersion).not.toBe(updatedUser.sessionVersion);
  });

  it('rejeita senha atual errada', async () => {
    const user = await db.user.findUniqueOrThrow({ where: { email: TEST_EMAIL } });
    await expect(
      changePassword(user.id, { currentPassword: 'errada', newPassword: 'nova-senha-123' }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });
});
