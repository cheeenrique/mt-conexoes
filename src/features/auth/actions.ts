'use server';

import { headers } from 'next/headers';
import { changePasswordSchema, loginSchema } from './schema';
import { changePassword, login } from './service';
import { setSessionCookie } from '@/lib/auth';
import { DomainError } from '@/lib/errors';
import { logger } from '@/lib/logger';

type AuthResult = { ok: true } | { error: { code: string; message: string } };

export async function loginAction(input: unknown): Promise<AuthResult> {
  const data = loginSchema.parse(input);
  const ip = (await headers()).get('x-forwarded-for') ?? 'unknown';

  try {
    const token = await login({ ...data, ip });
    await setSessionCookie(token);
    return { ok: true as const };
  } catch (err) {
    if (err instanceof DomainError) return { error: { code: err.code, message: err.message } };
    logger.error({ route: 'auth.login', error: String(err) });
    return { error: { code: 'UNEXPECTED', message: 'Não foi possível entrar. Tente de novo.' } };
  }
}

export async function changePasswordAction(input: unknown): Promise<AuthResult> {
  const data = changePasswordSchema.parse(input);

  try {
    const token = await changePassword(data);
    await setSessionCookie(token);
    return { ok: true as const };
  } catch (err) {
    if (err instanceof DomainError) return { error: { code: err.code, message: err.message } };
    logger.error({ route: 'auth.changePassword', error: String(err) });
    return { error: { code: 'UNEXPECTED', message: 'Não foi possível trocar a senha. Tente de novo.' } };
  }
}
