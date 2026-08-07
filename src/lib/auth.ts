import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { requireEnv } from './env';

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
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: ['HS256'] });
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
