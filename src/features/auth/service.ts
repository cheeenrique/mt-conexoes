import { hash, verify } from '@node-rs/argon2';
import type { LoginAttemptOutcome } from '@prisma/client';
import { db } from '@/lib/db';
import {
  CurrentPasswordInvalidError,
  InvalidCredentialsError,
  TooManyLoginAttemptsError,
  UnauthorizedError,
} from '@/lib/errors';
import { readSessionCookie, signSession, verifySession } from '@/lib/auth';
import { loginRemainingWaitMs } from '@/core/login-backoff';

// Rate limit por e-mail: teto mais alto que o de IP (que usa atraso
// progressivo via LOGIN_FREE_ATTEMPTS) — existe só pra segurar um ataque
// distribuído contra um único e-mail vindo de muitos IPs. Teto baixo demais
// vira DoS trivial contra o próprio operador.
const EMAIL_MAX_ATTEMPTS = 20;
const EMAIL_WINDOW_MINUTES = 15;

// Hash argon2id de uma senha descartável, gerado uma vez offline — não é
// segredo, é ballast. Sem ele, `user ? await verify(...) : false` faz
// e-mail inexistente responder em ~2ms contra ~16ms de um e-mail existente
// com senha errada: a diferença de tempo enumera usuário mesmo com mensagem
// de erro genérica.
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$gOWjpSeQAxeqHFCJ+hJuMQ$RN/G4mrl/1gZ3BqQekq0djOLEwJ6weXDVe6i4S80nC4';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  sessionVersion: number;
}

function toSessionUser(user: { id: string; email: string; name: string; sessionVersion: number }): SessionUser {
  return { id: user.id, email: user.email, name: user.name, sessionVersion: user.sessionVersion };
}

function recordAttempt(data: { ip: string; email: string; outcome: LoginAttemptOutcome; userAgent?: string }) {
  return db.loginAttempt.create({ data });
}

// Falhas contadas desde o último login bem-sucedido, não numa janela fixa —
// é o que faz o atraso progressivo funcionar. Uma janela fixa devolveria as
// tentativas de graça assim que expirasse (o bug que isso corrige).
async function ipFailureState(ip: string): Promise<{ count: number; lastAttemptAt: Date | null }> {
  const lastSuccess = await db.loginAttempt.findFirst({
    where: { ip, outcome: 'SUCCESS' },
    orderBy: { createdAt: 'desc' },
  });
  const since = lastSuccess?.createdAt ?? new Date(0);
  const failureWhere = { ip, outcome: { not: 'SUCCESS' as const }, createdAt: { gt: since } };
  const [count, last] = await Promise.all([
    db.loginAttempt.count({ where: failureWhere }),
    db.loginAttempt.findFirst({ where: failureWhere, orderBy: { createdAt: 'desc' } }),
  ]);
  return { count, lastAttemptAt: last?.createdAt ?? null };
}

async function emailAttemptsInWindow(email: string, now: Date): Promise<number> {
  const since = new Date(now.getTime() - EMAIL_WINDOW_MINUTES * 60 * 1000);
  return db.loginAttempt.count({ where: { email, outcome: { not: 'SUCCESS' }, createdAt: { gte: since } } });
}

export async function login(input: { email: string; password: string; ip: string; userAgent?: string }) {
  const now = new Date();
  const { count: ipFailures, lastAttemptAt } = await ipFailureState(input.ip);

  if (lastAttemptAt) {
    const waitMs = loginRemainingWaitMs(ipFailures, lastAttemptAt, now);
    if (waitMs > 0) {
      await recordAttempt({ ip: input.ip, email: input.email, outcome: 'RATE_LIMITED', userAgent: input.userAgent });
      throw new TooManyLoginAttemptsError(Math.ceil(waitMs / 1000));
    }
  }

  const emailAttempts = await emailAttemptsInWindow(input.email, now);
  if (emailAttempts >= EMAIL_MAX_ATTEMPTS) {
    await recordAttempt({ ip: input.ip, email: input.email, outcome: 'RATE_LIMITED', userAgent: input.userAgent });
    throw new TooManyLoginAttemptsError(EMAIL_WINDOW_MINUTES * 60);
  }

  const user = await db.user.findUnique({ where: { email: input.email } });
  // Roda o verify mesmo sem usuário, contra um hash descartável — mantém o
  // tempo de resposta parecido nos dois casos (ver DUMMY_HASH acima).
  const validPassword = await verify(user?.passwordHash ?? DUMMY_HASH, input.password);

  if (!user || !validPassword) {
    await recordAttempt({
      ip: input.ip,
      email: input.email,
      outcome: 'INVALID_CREDENTIALS',
      userAgent: input.userAgent,
    });
    throw new InvalidCredentialsError();
  }

  await recordAttempt({ ip: input.ip, email: input.email, outcome: 'SUCCESS', userAgent: input.userAgent });
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
  if (!validPassword) throw new CurrentPasswordInvalidError();

  const passwordHash = await hash(input.newPassword);
  const updated = await db.user.update({
    where: { id: user.id },
    data: { passwordHash, sessionVersion: { increment: 1 } },
  });
  return signSession({ userId: updated.id, sessionVersion: updated.sessionVersion });
}
