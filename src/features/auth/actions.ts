'use server';

import { headers } from 'next/headers';
import { changePasswordSchema, loginSchema } from './schema';
import { changePassword, login, requireSession } from './service';
import { setSessionCookie } from '@/lib/auth';
import { getClientIp } from '@/lib/net';
import { DomainError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { messages } from '@/lib/messages';

type AuthResult = { ok: true } | { error: { code: string; message: string } };

export async function loginAction(input: unknown): Promise<AuthResult> {
  try {
    const parsed = loginSchema.safeParse(input);
    if (!parsed.success) return { error: { code: 'VALIDATION', message: messages.auth.invalidInput } };

    const ip = getClientIp((await headers()).get('x-forwarded-for'));
    const token = await login({ ...parsed.data, ip });
    await setSessionCookie(token);
    return { ok: true as const };
  } catch (err) {
    if (err instanceof DomainError) return { error: { code: err.code, message: err.message } };
    logger.error({ route: 'auth.login', error: String(err), stack: err instanceof Error ? err.stack : undefined });
    return { error: { code: 'UNEXPECTED', message: messages.auth.loginFailed } };
  }
}

export async function changePasswordAction(input: unknown): Promise<AuthResult> {
  try {
    const user = await requireSession();
    const parsed = changePasswordSchema.safeParse(input);
    if (!parsed.success) return { error: { code: 'VALIDATION', message: messages.auth.invalidInput } };

    const token = await changePassword(user.id, parsed.data);
    await setSessionCookie(token);
    return { ok: true as const };
  } catch (err) {
    if (err instanceof DomainError) return { error: { code: err.code, message: err.message } };
    logger.error({
      route: 'auth.changePassword',
      error: String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return { error: { code: 'UNEXPECTED', message: messages.auth.passwordChangeFailed } };
  }
}
