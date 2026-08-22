import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { requireEnv } from './env';
import { db } from './db';
import { UnauthorizedError } from './errors';

const COOKIE_NAME = 'mtconexoes_session';
const SESSION_DAYS = 30;

interface SessionPayload {
  userId: string;
  sessionVersion: number;
}

const MIN_SECRET_LENGTH = 32;

function getSecret(): Uint8Array {
  const secret = requireEnv('SESSION_SECRET');
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`SESSION_SECRET precisa ter pelo menos ${MIN_SECRET_LENGTH} caracteres`);
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(getSecret());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  // getSecret() fica FORA do try: SESSION_SECRET ausente ou curto demais é
  // erro de configuração, e precisa estourar alto — não pode ser engolido
  // pelo catch de "token inválido" e aparecer só como "sessão expirada,
  // redireciona pro login" enquanto a causa real é a env var errada.
  const secret = getSecret();

  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] });
    if (typeof payload.userId !== 'string' || typeof payload.sessionVersion !== 'number') return null;
    return { userId: payload.userId, sessionVersion: payload.sessionVersion };
  } catch {
    return null;
  }
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function readSessionCookie(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(COOKIE_NAME)?.value;
}

export { COOKIE_NAME };

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  sessionVersion: number;
}

function toSessionUser(user: { id: string; email: string; name: string; sessionVersion: number }): SessionUser {
  return { id: user.id, email: user.email, name: user.name, sessionVersion: user.sessionVersion };
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
// token), e é o que o teste de integração de features/auth exercita
// diretamente pra provar que a invalidação por sessionVersion funciona de
// ponta a ponta com o fluxo de troca de senha (que continua em
// features/auth/service.ts).
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
