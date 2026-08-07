import { hash, verify } from '@node-rs/argon2';
import { db } from '@/lib/db';
import { InvalidCredentialsError, TooManyLoginAttemptsError, UnauthorizedError } from '@/lib/errors';
import { readSessionCookie, signSession, verifySession } from '@/lib/auth';

const MAX_ATTEMPTS = 5;
const WINDOW_MINUTES = 15;

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  sessionVersion: number;
}

function toSessionUser(user: { id: string; email: string; name: string; sessionVersion: number }): SessionUser {
  return { id: user.id, email: user.email, name: user.name, sessionVersion: user.sessionVersion };
}

export async function login(input: { email: string; password: string; ip: string }) {
  const since = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000);
  const attempts = await db.loginAttempt.count({ where: { ip: input.ip, createdAt: { gte: since } } });
  if (attempts >= MAX_ATTEMPTS) throw new TooManyLoginAttemptsError();

  const user = await db.user.findUnique({ where: { email: input.email } });
  const validPassword = user ? await verify(user.passwordHash, input.password) : false;

  if (!user || !validPassword) {
    await db.loginAttempt.create({ data: { ip: input.ip } });
    throw new InvalidCredentialsError();
  }

  return signSession({ userId: user.id, sessionVersion: user.sessionVersion });
}

// Extraído pra ser testável isoladamente: uma sessão só é válida se a
// versão gravada no token bater com a versão atual do usuário no banco.
// Trocar a senha incrementa `sessionVersion`, o que invalida qualquer token
// emitido antes — é essa comparação que faz a invalidação funcionar.
export function isSessionValid(
  user: { sessionVersion: number } | null | undefined,
  payload: { sessionVersion: number } | null,
): boolean {
  if (!user || !payload) return false;
  return user.sessionVersion === payload.sessionVersion;
}

// Caminho real de autenticação por token, sem depender de cookies() — é o
// que getCurrentUser/requireSession chamam (só variam de onde tiram o
// token), e é o que o teste de integração exercita diretamente pra provar
// que a invalidação por sessionVersion funciona de ponta a ponta.
export async function resolveSessionUser(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;

  const payload = await verifySession(token);
  if (!payload) return null;

  const user = await db.user.findUnique({ where: { id: payload.userId } });
  if (!user || !isSessionValid(user, payload)) return null;

  return toSessionUser(user);
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  return resolveSessionUser(await readSessionCookie());
}

export async function requireSession(): Promise<SessionUser> {
  const user = await resolveSessionUser(await readSessionCookie());
  if (!user) throw new UnauthorizedError();
  return user;
}

export async function changePassword(
  userId: string,
  input: { currentPassword: string; newPassword: string },
) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new UnauthorizedError();

  const validPassword = await verify(user.passwordHash, input.currentPassword);
  if (!validPassword) throw new InvalidCredentialsError();

  const passwordHash = await hash(input.newPassword);
  const updated = await db.user.update({
    where: { id: user.id },
    data: { passwordHash, sessionVersion: { increment: 1 } },
  });
  return signSession({ userId: updated.id, sessionVersion: updated.sessionVersion });
}
