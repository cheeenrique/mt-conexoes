import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hash } from '@node-rs/argon2';
import { db } from '@/lib/db';
import { changePassword, isSessionValid, login, resolveSessionUser } from './service';
import { CurrentPasswordInvalidError, InvalidCredentialsError, TooManyLoginAttemptsError } from '@/lib/errors';

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
  it('rejeita o token de sessão antigo pelo caminho real de autenticação depois da troca de senha', async () => {
    const user = await db.user.findUniqueOrThrow({ where: { email: TEST_EMAIL } });
    const oldToken = await login({ email: TEST_EMAIL, password: 'senha-correta', ip: '127.0.0.4' });

    // Confere que o token antigo autentica ANTES da troca — se essa asserção
    // falhar, o teste de baixo não prova nada (não dá pra invalidar o que
    // nunca funcionou). resolveSessionUser é o mesmo caminho que
    // getCurrentUser/requireSession usam, só que sem depender de cookies().
    expect(await resolveSessionUser(oldToken)).not.toBeNull();

    await changePassword(user.id, { currentPassword: 'senha-correta', newPassword: 'nova-senha-123' });

    // Depois da troca, o mesmo token — mesma assinatura, ainda válido pro
    // jose — precisa deixar de autenticar porque sessionVersion mudou.
    // Esse é o comportamento que quebra se alguém remover a checagem de
    // isSessionValid dentro de resolveSessionUser.
    expect(await resolveSessionUser(oldToken)).toBeNull();

    // E o token novo, emitido depois da troca, autentica normalmente.
    const newToken = await login({ email: TEST_EMAIL, password: 'nova-senha-123', ip: '127.0.0.4' });
    expect(await resolveSessionUser(newToken)).not.toBeNull();
  });

  it('rejeita senha atual errada', async () => {
    const user = await db.user.findUniqueOrThrow({ where: { email: TEST_EMAIL } });
    await expect(
      changePassword(user.id, { currentPassword: 'errada', newPassword: 'nova-senha-123' }),
    ).rejects.toBeInstanceOf(CurrentPasswordInvalidError);
  });
});

describe('isSessionValid', () => {
  it('é verdadeiro quando a sessionVersion do usuário bate com a do payload', () => {
    expect(isSessionValid({ sessionVersion: 3 }, { sessionVersion: 3 })).toBe(true);
  });

  it('é falso quando a sessionVersion diverge (senha trocada depois do token)', () => {
    expect(isSessionValid({ sessionVersion: 4 }, { sessionVersion: 3 })).toBe(false);
  });

  it('é falso quando o usuário ou o payload é nulo', () => {
    expect(isSessionValid(null, { sessionVersion: 3 })).toBe(false);
    expect(isSessionValid({ sessionVersion: 3 }, null)).toBe(false);
  });
});
